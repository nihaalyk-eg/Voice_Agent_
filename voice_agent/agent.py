import asyncio
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path as _Path
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

from livekit.agents import AgentSession, Agent, JobContext, WorkerOptions, cli, inference, llm
from livekit.plugins import azure
from livekit.plugins import openai as lk_openai
from langfuse_setup import setup_langfuse
import cdb_tools
from languages import resolve_language

MAX_HISTORY_MESSAGES = 10

# ── Bench file ────────────────────────────────────────────────────────────────
# The Pipeline agent previously wrote no latency data at all (bench_file was None
# in server.py) — its AgentSession framework exposes per-turn timing via
# ChatMessage.metrics on the "conversation_item_added" event, unlike the raw
# websocket agents which track it manually. Wiring that up here so the Latency
# Metrics panel isn't permanently empty for this agent (the only one CDB mode runs on).
_DATA = _Path(__file__).parent / "data"
_DATA.mkdir(exist_ok=True)
BENCH_FILE = str(_DATA / "bench_pipeline.jsonl")


@dataclass
class Turn:
    turn: int
    speech_stopped_ms: float | None = None
    first_audio_ms: float | None = None
    transcript_ms: float | None = None
    response_done_ms: float | None = None
    e2e_ms: float | None = None
    stt_ms: float | None = None
    agent_text: str = ""
    user_text: str = ""


def _save_turn(t: Turn) -> None:
    with open(BENCH_FILE, "a") as f:
        f.write(json.dumps(asdict(t)) + "\n")

INSTRUCTIONS = os.environ.get(
    "AGENT_INSTRUCTIONS",
    "You are a helpful, concise voice assistant. Keep responses short and conversational — two or three sentences max.",
)
VOICE     = os.environ.get("AGENT_VOICE",     "en-US-JennyNeural")
LANGUAGE  = os.environ.get("AGENT_LANGUAGE",  "en-US")
PROACTIVE = os.environ.get("AGENT_PROACTIVE", "0") == "1"

# Available in every mode (Simple, Form, CDB) — not just CDB — since any
# caller might ask to switch languages regardless of what the call is about.
INSTRUCTIONS += (
    "\n\nIf the caller asks to continue in a different language, call "
    "switch_language(language) with the language they asked for (a name like "
    "'Spanish' or a locale code like 'es-ES'). This actually changes what you "
    "speak and understand next — once it succeeds, continue the rest of the "
    "call in that language."
)

# Form mode: augment instructions with field-collection guidance
_config_raw = os.environ.get("AGENT_CONFIG")
_form_fields: list[dict] = []
if _config_raw:
    try:
        _cfg = json.loads(_config_raw)
        _form_fields = _cfg.get("required_fields", [])
        if _form_fields:
            _lines = "\n".join(
                f'- {f.get("label", f["key"])}: {f.get("description", "")}'
                for f in _form_fields
            )
            _keys = ", ".join(f["key"] for f in _form_fields)
            INSTRUCTIONS += (
                f"\n\nYou are in FORM MODE. Collect the following from the user naturally:\n{_lines}\n"
                f"When the user provides a value, call collect_field(key, value) immediately.\n"
                f"Field keys: {_keys}\n"
                f"Once all fields are collected, confirm each value back to the user and thank them."
            )
    except Exception:
        pass

# CDB mode: augment instructions with the customer-lookup → confirm → work-order flow.
# CALLER_PHONE simulates caller ID (from a dialer in the UI) — when set, we look the
# customer up by exact phone match BEFORE the call starts, instead of asking the
# caller to say their name/phone and running it through STT. Spoken digits transcribe
# unreliably (missing spaces, misheard numbers) and almost never match the "+358 40
# 123 4567"-style formatting stored in the database, so voice-based phone matching
# was failing even when the number genuinely existed.
CDB_MODE     = os.environ.get("AGENT_CDB_MODE", "0") == "1"
CALLER_PHONE = os.environ.get("AGENT_CALLER_PHONE", "").strip()

CDB_GREETING_ASK_NAME = "Hi, thanks for calling! Could I start with your full name so I can pull up your account?"

CDB_FLOW_MANUAL = (
    "\n\nYou are in CUSTOMER LOOKUP MODE. This is a phone call — the caller can only speak to "
    "you, they cannot send, type, or upload anything. Never ask them to 'send' information; "
    "always ask them to say it out loud. Follow this flow exactly:\n"
    "1. Your very first line already asked the caller for their full name — do not ask again "
    "or greet them a second time. Wait for their answer.\n"
    "2. Call search_customer(query) with the name they gave you.\n"
    "3. If exactly one match is found, read back their name and property address and ask "
    "them to confirm — e.g. 'I have a record for {name} at {address}, is that you?'.\n"
    "4. If several matches are found, ask the caller to say one more identifying detail — "
    "their apartment number or property address — and call search_customer again with that "
    "new detail to narrow it down. Do not ask for a phone number; you can't reliably match "
    "spoken digits.\n"
    "5. If no match is found, do NOT ask for the same name again. Instead say you couldn't "
    "find a record under that name, and ask the caller to say their property address instead, "
    "then call search_customer again with that new detail.\n"
    "6. If a second search also comes back with no match, stop trying to look them up. Tell "
    "the caller you'll proceed without an account match, and ask them to say their full name, "
    "a callback phone number, and property address directly so you can file the work order.\n"
    "7. Once the caller's identity is confirmed (or given manually), ask what issue they are "
    "experiencing. As soon as they answer, call collect_field('issue', <what they said>).\n"
    "8. Then ask, one at a time, and call collect_field immediately after each answer:\n"
    "   - 'Is this in a shared/common area, or your own unit?' → collect_field('common_area', 'Yes' or 'No')\n"
    "   - 'If no one answers, can the technician enter with a master key?' → collect_field('master_key', 'Yes' or 'No')\n"
    "   - 'Any access notes — gate codes, pets, when you're available?' (if search_customer returned "
    "on-file notes for this customer, mention them here instead of asking as if you know nothing, e.g. "
    "'I have a note that you have a dog, anything else the technician should know?') → "
    "collect_field('access_notes', <combined result, or 'None'>)\n"
    "9. Once you have all of that, call create_work_order(...). If search_customer found their "
    "record, its phone number is already in your context — use that, don't ask the caller to "
    "repeat it. Then tell the caller their work order number and that a technician will follow up."
)


class VoiceAgent(Agent):
    def __init__(self, *args, matched_customer: dict | None = None, stt_instance=None, tts_instance=None, **kwargs):
        super().__init__(*args, **kwargs)
        # Canonical customer record, set by caller-ID match at call start or by
        # search_customer() once it finds exactly one match. create_work_order()
        # trusts this over whatever address the LLM reconstructed from the
        # conversation, since a mistranscribed or slightly-off spoken address
        # would otherwise silently fail the backend's property lookup and
        # dispatch a wrong default technician instead of erroring out.
        self._matched_customer = matched_customer
        # Live STT/TTS instances so switch_language() can reconfigure them
        # in place mid-call via update_options() — no session restart needed.
        self._stt_instance = stt_instance
        self._tts_instance = tts_instance

    @llm.function_tool
    async def collect_field(self, key: str, value: str) -> str:
        """
        Record a field value collected from the user. Call immediately when the user
        provides a piece of required information.

        Args:
            key: The field key (e.g. 'name', 'phone', 'email').
            value: The exact value provided by the user.
        """
        print(f"[field] {key}: {value}")
        return f"Recorded {key}."

    @llm.function_tool
    async def search_customer(self, query: str) -> str:
        """
        Search the customer database by name, phone number, or property address.
        Call this as soon as the caller gives you any identifying detail.

        Args:
            query: The name, phone number, or address fragment the caller provided.
        """
        try:
            matches = await cdb_tools.search_customers(query)
        except Exception as e:
            return f"Customer lookup failed ({e}). Ask the caller for their info manually."

        if not matches:
            print(f"[customer] {json.dumps({'status': 'not_found', 'query': query})}")
            return "No matching customer found. Ask the caller for their name and property address manually — don't rely on a spoken phone number, it won't match reliably."

        if len(matches) > 1:
            summary = "; ".join(f"{m['full_name']} ({m.get('property_address', 'unknown address')})" for m in matches[:5])
            print(f"[customer] {json.dumps({'status': 'multiple', 'matches': matches[:5]})}")
            return f"Multiple matches found: {summary}. Ask the caller for their apartment number or property address to narrow it down, then search again."

        m = matches[0]
        self._matched_customer = m
        print(f"[customer] {json.dumps({'status': 'match', 'customer': m})}")
        apt = f", apartment {m['apartment_number']}" if m.get("apartment_number") else ""
        extra = ""
        if m.get("notes"):
            extra += f" On-file notes for this customer: \"{m['notes']}\"."
        if m.get("language_preference"):
            extra += f" Preferred language: {m['language_preference']}."
        return (
            f"Match found — name: {m['full_name']}, phone: {m['phone_number']}, "
            f"address: {m.get('property_address', 'unknown')}{apt}.{extra} "
            f"Read the name and address back to the caller and ask them to confirm it's them before "
            f"continuing — don't read out the notes or language preference yet. Keep them in mind: "
            f"when you get to access notes for the work order, weave in anything relevant from the "
            f"on-file notes (e.g. a pet, entry instructions) rather than asking as if you know nothing, "
            f"and if their preferred language differs from this call's current language, offer to switch "
            f"to it — e.g. 'I see you prefer {m.get('language_preference', '')}, would you like me to "
            f"continue in that language?' — and call switch_language(...) if they say yes."
        )

    @llm.function_tool
    async def create_work_order(
        self,
        property_address: str,
        issue_description: str,
        caller_phone_number: str,
        apartment_number: str = "",
        urgency_level: str = "Standard",
        is_common_area: bool = False,
        permit_master_key: bool = False,
        special_notes: str = "",
    ) -> str:
        """
        Create a work order once the caller's identity is confirmed and their issue is known.
        Before calling this, always ask the caller: (1) is this in a shared/common area or
        their own unit, (2) may the technician enter with a master key if no one answers the
        door, and (3) any access notes — gate codes, pets, or when they're available.

        Args:
            property_address: The confirmed property address.
            issue_description: What the caller says is wrong.
            caller_phone_number: The caller's phone number.
            apartment_number: Apartment or unit number, if any.
            urgency_level: One of Standard, Urgent, Emergency, Low.
            is_common_area: True if the issue is in a shared/common space, not the caller's own unit.
            permit_master_key: True if the caller allows the technician to enter with a master key if no one is home.
            special_notes: Access notes for the technician — gate codes, pets, availability, etc.
        """
        # A matched customer record (from caller ID or search_customer) is always
        # trusted over what the LLM reconstructed from the conversation.
        if self._matched_customer:
            property_address = self._matched_customer.get("property_address") or property_address
            apartment_number = self._matched_customer.get("apartment_number") or apartment_number
            caller_phone_number = self._matched_customer.get("phone_number") or caller_phone_number

        try:
            result = await cdb_tools.create_work_order(
                property_address=property_address,
                apartment_number=apartment_number or None,
                issue_description=issue_description,
                caller_phone_number=caller_phone_number,
                urgency_level=urgency_level,
                is_common_area=is_common_area,
                permit_master_key=permit_master_key,
                special_notes=special_notes,
                source="voice",
                call_category="fault_report",
            )
        except Exception as e:
            return f"Failed to create the work order ({e}). Apologize and tell the caller you'll follow up."

        print(f"[workorder] {json.dumps(result)}")
        return f"Work order {result.get('id', '')} created successfully. Tell the caller a technician will follow up, scheduled for {result.get('scheduled_time', 'soon')}."

    @llm.function_tool
    async def switch_language(self, language: str) -> str:
        """
        Switch the spoken/transcription language mid-call. Call this whenever the
        caller asks to continue in a different language, or when you decide to
        proactively switch to a matched customer's preferred language.

        Args:
            language: The language name (e.g. 'Spanish') or locale code (e.g. 'es-ES') to switch to.
        """
        resolved = resolve_language(language)
        if not resolved:
            return f"'{language}' isn't a language I support switching to. Continue in the current language and apologize."

        locale, voice, display = resolved
        try:
            if self._stt_instance:
                self._stt_instance.update_options(language=locale)
            if self._tts_instance:
                self._tts_instance.update_options(voice=voice)
        except Exception as e:
            return f"Failed to switch language ({e}). Continue in the current language."

        print(f"[ui] switched language to {display} ({locale})")
        return f"Switched to {display}. From now on, speak and understand the caller in {display}."

    async def on_user_turn_completed(self, turn_ctx, new_message=None) -> None:
        turn_ctx.truncate(max_items=MAX_HISTORY_MESSAGES)


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    print(f"[agent] room: {ctx.room.name}")

    trace_provider = setup_langfuse(session_id=ctx.room.name)

    async def _flush():
        await asyncio.to_thread(trace_provider.force_flush)

    ctx.add_shutdown_callback(_flush)

    instructions = INSTRUCTIONS
    greeting = "Hello! How can I help you today?"
    greeting_instructions = None  # when set, used with generate_reply() instead of a fixed say()
    matched_customer = None

    # Defaults to the call's configured language/voice; overridden below if a
    # matched customer has a resolvable preferred language, so the very first
    # word spoken is already in the right language instead of switching later.
    initial_language, initial_voice = LANGUAGE, VOICE

    if CDB_MODE:
        if CALLER_PHONE:
            try:
                matched_customer = await cdb_tools.lookup_by_phone(CALLER_PHONE)
            except Exception as e:
                print(f"[ui] caller-ID lookup failed: {e}")

        preferred_lang_note = ""
        if matched_customer and matched_customer.get("language_preference"):
            resolved = resolve_language(matched_customer["language_preference"])
            if resolved:
                initial_language, initial_voice, lang_display = resolved
                preferred_lang_note = (
                    f" This customer's preferred language is {lang_display} — speak and understand "
                    f"only in {lang_display} from your very first word, including the greeting."
                )

        if matched_customer:
            print(f"[customer] {json.dumps({'status': 'match', 'customer': matched_customer, 'via': 'caller_id'})}")
            first_name = matched_customer["full_name"].split()[0]
            address = matched_customer.get("property_address", "your property")
            apt = f", apartment {matched_customer['apartment_number']}" if matched_customer.get("apartment_number") else ""
            if preferred_lang_note:
                # Text is generated fresh by the LLM in the right language,
                # instead of speaking a hardcoded English string through a
                # non-English voice.
                greeting_instructions = (
                    f"Greet the caller by their first name, {first_name}, mention you have their account "
                    f"for {address}{apt} pulled up, and ask them to confirm that's the property they're "
                    f"calling about.{preferred_lang_note}"
                )
            else:
                greeting = (
                    f"Hi {first_name}, thanks for calling! I have your account for {address}{apt} "
                    f"pulled up — is that the property you're calling about?"
                )
            instructions += (
                "\n\nYou are in CUSTOMER LOOKUP MODE. This is a phone call — the caller can only "
                "speak, they cannot send or type anything.\n"
                f"Caller ID already matched this call to an existing customer: {json.dumps(matched_customer)}. "
                "This record's 'notes' field (if present) is on-file context — e.g. a pet, entry "
                "instructions, work schedule — treat it as already known, don't ask the caller to repeat "
                "it, but do weave it in naturally when relevant (especially for access notes below)."
                f"{preferred_lang_note}\n"
                "Your greeting already read back their property address and asked them to confirm it.\n"
                "1. Wait for the caller to confirm or correct the address.\n"
                "2. If they confirm, ask what issue they are experiencing. As soon as they answer, "
                "call collect_field('issue', <what they said>).\n"
                "3. If they say it's wrong, ask for their full name and call search_customer(query) "
                "to find the right record; if none is found, collect their info manually instead.\n"
                "4. Then ask, one at a time, and call collect_field immediately after each answer:\n"
                "   - 'Is this in a shared/common area, or your own unit?' → collect_field('common_area', 'Yes' or 'No')\n"
                "   - 'If no one answers, can the technician enter with a master key?' → collect_field('master_key', 'Yes' or 'No')\n"
                "   - 'Any access notes — gate codes, pets, when you're available?' (mention their on-file "
                "notes here if relevant, e.g. 'I have a note that you have a dog, is there anything else "
                "the technician should know?') → collect_field('access_notes', <combined result, or 'None'>)\n"
                "5. Once identity is settled, you know the issue, and you've asked those three things, "
                f"call create_work_order(...). Use phone number '{matched_customer.get('phone_number', '')}' "
                "unless the caller gave you a different confirmed record — don't ask them to repeat it. "
                "Then tell the caller their work order number and that a technician will follow up."
            )
        else:
            greeting = CDB_GREETING_ASK_NAME
            instructions += CDB_FLOW_MANUAL

    stt_instance = azure.STT(
        speech_key=os.environ["AZURE_SPEECH_KEY"],
        speech_region=os.environ["AZURE_SPEECH_REGION"],
        language=initial_language,
    )
    tts_instance = azure.TTS(
        speech_key=os.environ["AZURE_SPEECH_KEY"],
        speech_region=os.environ["AZURE_SPEECH_REGION"],
        voice=initial_voice,
    )

    session = AgentSession(
        vad=inference.VAD(
            model="silero",
            min_silence_duration=0.6,
            activation_threshold=0.5,
            prefix_padding_duration=0.5,
        ),
        stt=stt_instance,
        llm=lk_openai.LLM.with_azure(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
            azure_deployment=os.environ["CHAT_DEPLOYMENT_NAME"],
            api_version=os.environ.get("OPENAI_API_VERSION", "2024-10-21"),
            model=os.environ["CHAT_DEPLOYMENT_NAME"],
        ),
        tts=tts_instance,
    )

    await session.start(
        room=ctx.room,
        agent=VoiceAgent(
            instructions=instructions,
            matched_customer=matched_customer,
            stt_instance=stt_instance,
            tts_instance=tts_instance,
        ),
    )

    turn_state = {"n": 0, "pending": None}

    def _on_item_added(ev):
        item = ev.item
        if getattr(item, "type", None) != "message":
            return
        metrics = item.metrics or {}

        if item.role == "user":
            turn_state["n"] += 1
            stopped_at = metrics.get("stopped_speaking_at")
            transcript_delay = metrics.get("transcription_delay")
            turn_state["pending"] = Turn(
                turn=turn_state["n"],
                user_text=item.text_content or "",
                speech_stopped_ms=stopped_at * 1000 if stopped_at else None,
                stt_ms=transcript_delay * 1000 if transcript_delay is not None else None,
            )
        elif item.role == "assistant" and turn_state["pending"] is not None:
            t = turn_state["pending"]
            e2e = metrics.get("e2e_latency")
            t.agent_text = item.text_content or ""
            t.e2e_ms = e2e * 1000 if e2e is not None else None
            t.response_done_ms = item.created_at * 1000
            if t.speech_stopped_ms and t.e2e_ms:
                t.first_audio_ms = t.speech_stopped_ms + t.e2e_ms
            _save_turn(t)
            print(f"Turn #{t.turn} — e2e {t.e2e_ms and round(t.e2e_ms)} ms, stt {t.stt_ms and round(t.stt_ms)} ms")
            turn_state["pending"] = None

    session.on("conversation_item_added", _on_item_added)

    if PROACTIVE:
        if greeting_instructions:
            await session.generate_reply(instructions=greeting_instructions)
        else:
            await session.say(greeting)

    done = asyncio.Event()

    def _on_disconnect(*_):
        done.set()

    ctx.room.on("disconnected", _on_disconnect)
    try:
        await done.wait()
    finally:
        ctx.room.off("disconnected", _on_disconnect)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
