"""
Shared function-calling + CDB adapter for the raw session-based agents
(agent_realtime.py, agent_voice_live.py). Both speak the same OpenAI/Azure
Realtime-style tool-calling protocol:

  response.function_call_arguments.done  -> we execute the tool
  conversation.item.create (function_call_output) -> send the result back
  response.create                         -> let the model continue speaking

so the tool schema and execution logic live here once instead of being
duplicated across two near-identical files. Mirrors agent.py's VoiceAgent
tools (search_customer, create_work_order, collect_field) and CDB flow, since
that's the only agent with tool-calling before this module existed.
"""

import json

import cdb_tools
from languages import resolve_language

# switch_language is always offered, regardless of CDB mode, since any caller
# might ask to continue in a different language. The other three are CDB-only
# — exposing them outside CDB mode risks the model calling create_work_order
# in a context where there's no customer/work-order flow to speak of.
SWITCH_LANGUAGE_TOOL = {
    "type": "function",
    "name": "switch_language",
    "description": "Switch the spoken/transcription language mid-call when the caller asks to continue in a different language.",
    "parameters": {
        "type": "object",
        "properties": {
            "language": {
                "type": "string",
                "description": "The language name or locale code the caller asked for, e.g. 'Spanish' or 'es-ES'.",
            },
        },
        "required": ["language"],
    },
}

# Shared by Form mode (collecting arbitrary caller-supplied fields) and CDB
# mode (collecting issue/common_area/master_key/access_notes) — both just
# need a generic "record this value under this key" tool.
COLLECT_FIELD_TOOL = {
    "type": "function",
    "name": "collect_field",
    "description": "Record a field value collected from the user. Call immediately when the user provides a piece of required information.",
    "parameters": {
        "type": "object",
        "properties": {
            "key": {"type": "string", "description": "The field key, e.g. 'name', 'phone', 'issue', 'common_area', 'master_key', 'access_notes'."},
            "value": {"type": "string", "description": "The exact value provided by the user."},
        },
        "required": ["key", "value"],
    },
}

# CDB-only — exposing these outside CDB mode risks the model calling
# create_work_order in a context where there's no customer/work-order flow.
CDB_ONLY_TOOLS = [
    {
        "type": "function",
        "name": "search_customer",
        "description": "Search the customer database by name, phone number, or property address. Call this as soon as the caller gives any identifying detail.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The name, phone number, or address fragment the caller provided."},
            },
            "required": ["query"],
        },
    },
    {
        "type": "function",
        "name": "create_work_order",
        "description": "Create a work order once the caller's identity is confirmed and their issue is known.",
        "parameters": {
            "type": "object",
            "properties": {
                "property_address": {"type": "string", "description": "The confirmed property address."},
                "issue_description": {"type": "string", "description": "What the caller says is wrong."},
                "caller_phone_number": {"type": "string", "description": "The caller's phone number."},
                "apartment_number": {"type": "string", "description": "Apartment or unit number, if any."},
                "urgency_level": {"type": "string", "enum": ["Standard", "Urgent", "Emergency", "Low"]},
                "is_common_area": {"type": "boolean", "description": "True if the issue is in a shared/common space, not the caller's own unit."},
                "permit_master_key": {"type": "boolean", "description": "True if the caller allows the technician to enter with a master key if no one is home."},
                "special_notes": {"type": "string", "description": "Access notes for the technician — gate codes, pets, availability, etc."},
            },
            "required": ["property_address", "issue_description", "caller_phone_number"],
        },
    },
]


def build_tools_schema(cdb_mode: bool, form_mode: bool = False) -> list[dict]:
    tools = [SWITCH_LANGUAGE_TOOL]
    if cdb_mode or form_mode:
        tools.append(COLLECT_FIELD_TOOL)
    if cdb_mode:
        tools.extend(CDB_ONLY_TOOLS)
    return tools


def build_form_instructions(base_instructions: str, agent_config: dict | None) -> str:
    """
    Mirrors agent.py's Form mode augmentation: given the same agent_config
    JSON the frontend sends (a 'required_fields' list of {key, label,
    description}), tell the model to collect each one via collect_field.
    """
    if not agent_config:
        return base_instructions
    fields = agent_config.get("required_fields", [])
    if not fields:
        return base_instructions

    lines = "\n".join(f'- {f.get("label", f["key"])}: {f.get("description", "")}' for f in fields)
    keys = ", ".join(f["key"] for f in fields)
    return base_instructions + (
        f"\n\nYou are in FORM MODE. Collect the following from the user naturally:\n{lines}\n"
        f"When the user provides a value, call collect_field(key, value) immediately.\n"
        f"Field keys: {keys}\n"
        f"Once all fields are collected, confirm each value back to the user and thank them."
    )


class CdbState:
    """Per-call mutable state, mirroring agent.py's VoiceAgent._matched_customer."""

    def __init__(self):
        self.matched_customer: dict | None = None


async def execute_tool(name: str, arguments_json: str, state: CdbState, switch_language_cb=None) -> str:
    try:
        args = json.loads(arguments_json) if arguments_json else {}
    except json.JSONDecodeError:
        args = {}

    if name == "switch_language":
        return await _switch_language(args.get("language", ""), switch_language_cb)
    if name == "collect_field":
        print(f"[field] {args.get('key')}: {args.get('value')}")
        return f"Recorded {args.get('key')}."
    if name == "search_customer":
        return await _search_customer(args.get("query", ""), state)
    if name == "create_work_order":
        return await _create_work_order(args, state)
    return f"Unknown tool: {name}"


async def _search_customer(query: str, state: CdbState) -> str:
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
    state.matched_customer = m
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
        f"to it and call switch_language(...) if they say yes."
    )


async def _create_work_order(args: dict, state: CdbState) -> str:
    property_address = args.get("property_address", "")
    apartment_number = args.get("apartment_number", "")
    caller_phone_number = args.get("caller_phone_number", "")

    # A matched customer record (caller ID or search_customer) is always
    # trusted over whatever the model reconstructed from the conversation.
    if state.matched_customer:
        property_address = state.matched_customer.get("property_address") or property_address
        apartment_number = state.matched_customer.get("apartment_number") or apartment_number
        caller_phone_number = state.matched_customer.get("phone_number") or caller_phone_number

    try:
        result = await cdb_tools.create_work_order(
            property_address=property_address,
            apartment_number=apartment_number or None,
            issue_description=args.get("issue_description", ""),
            caller_phone_number=caller_phone_number,
            urgency_level=args.get("urgency_level", "Standard"),
            is_common_area=bool(args.get("is_common_area", False)),
            permit_master_key=bool(args.get("permit_master_key", False)),
            special_notes=args.get("special_notes", ""),
            source="voice",
            call_category="fault_report",
        )
    except Exception as e:
        return f"Failed to create the work order ({e}). Apologize and tell the caller you'll follow up."

    print(f"[workorder] {json.dumps(result)}")
    return f"Work order {result.get('id', '')} created successfully. Tell the caller a technician will follow up, scheduled for {result.get('scheduled_time', 'soon')}."


async def _switch_language(language: str, switch_language_cb) -> str:
    resolved = resolve_language(language)
    if not resolved:
        return f"'{language}' isn't a language I support switching to. Continue in the current language and apologize."

    locale, voice, display = resolved
    if switch_language_cb:
        try:
            await switch_language_cb(locale, voice)
        except Exception as e:
            return f"Failed to switch language ({e}). Continue in the current language."

    print(f"[ui] switched language to {display} ({locale})")
    return f"Switched to {display}. From now on, speak and understand the caller in {display}."


def build_cdb_instructions(base_instructions: str, matched_customer: dict | None) -> tuple[str, str | None, str | None]:
    """
    Returns (full_instructions, resolved_locale_or_None, resolved_voice_or_None).

    Unlike agent.py, these session-based agents generate their own opening
    line straight from `instructions` once `response.create` fires — there's
    no separate "say this exact greeting" mechanism, so the greeting behavior
    is folded directly into the instructions text below.
    """
    preferred_lang_note = ""
    locale = voice = None
    if matched_customer and matched_customer.get("language_preference"):
        resolved = resolve_language(matched_customer["language_preference"])
        if resolved:
            locale, voice, lang_display = resolved
            preferred_lang_note = (
                f" This customer's preferred language is {lang_display} — speak and understand only "
                f"in {lang_display} from your very first word, including the greeting."
            )

    if matched_customer:
        first_name = matched_customer["full_name"].split()[0]
        address = matched_customer.get("property_address", "your property")
        apt = f", apartment {matched_customer['apartment_number']}" if matched_customer.get("apartment_number") else ""
        instructions = base_instructions + (
            "\n\nYou are in CUSTOMER LOOKUP MODE. This is a phone call — the caller can only speak, "
            "they cannot send or type anything.\n"
            f"Caller ID already matched this call to an existing customer: {json.dumps(matched_customer)}. "
            "This record's 'notes' field (if present) is on-file context — treat it as already known, "
            "don't ask the caller to repeat it, but weave it in naturally when relevant."
            f"{preferred_lang_note}\n"
            f"1. As your very first message, greet the caller by their first name, {first_name}, mention "
            f"you have their account for {address}{apt} pulled up, and ask them to confirm that's the "
            "property they're calling about.\n"
            "2. If they confirm, ask what issue they are experiencing. As soon as they answer, call "
            "collect_field('issue', <what they said>).\n"
            "3. If they say it's wrong, ask for their full name and call search_customer(query) to find "
            "the right record; if none is found, collect their info manually instead.\n"
            "4. Then ask, one at a time, and call collect_field immediately after each answer:\n"
            "   - 'Is this in a shared/common area, or your own unit?' → collect_field('common_area', 'Yes' or 'No')\n"
            "   - 'If no one answers, can the technician enter with a master key?' → collect_field('master_key', 'Yes' or 'No')\n"
            "   - 'Any access notes — gate codes, pets, when you're available?' (mention their on-file "
            "notes here if relevant, e.g. 'I have a note that you have a dog, anything else the technician "
            "should know?') → collect_field('access_notes', <combined result, or 'None'>)\n"
            "5. Once identity is settled, you know the issue, and you've asked those three things, call "
            f"create_work_order(...). Use phone number '{matched_customer.get('phone_number', '')}' unless "
            "the caller gave you a different confirmed record — don't ask them to repeat it. Then tell the "
            "caller their work order number and that a technician will follow up."
        )
    else:
        instructions = base_instructions + (
            "\n\nYou are in CUSTOMER LOOKUP MODE. This is a phone call — the caller can only speak, they "
            "cannot send, type, or upload anything. Never ask them to 'send' information; always ask them "
            "to say it out loud.\n"
            "1. As your very first message, ask the caller for their full name.\n"
            "2. Call search_customer(query) with the name they gave you.\n"
            "3. If exactly one match is found, read back their name and property address and ask them to "
            "confirm — e.g. 'I have a record for {name} at {address}, is that you?'.\n"
            "4. If several matches are found, ask the caller to say one more identifying detail — their "
            "apartment number or property address — and call search_customer again with that new detail. "
            "Do not ask for a phone number; you can't reliably match spoken digits.\n"
            "5. If no match is found, do NOT ask for the same name again. Ask for their property address "
            "instead, then call search_customer again.\n"
            "6. If a second search also comes back with no match, stop trying to look them up. Ask them to "
            "say their full name, a callback phone number, and property address directly.\n"
            "7. Once identity is confirmed (or given manually), ask what issue they are experiencing. Call "
            "collect_field('issue', <what they said>) as soon as they answer.\n"
            "8. Then ask, one at a time, and call collect_field immediately after each answer:\n"
            "   - 'Is this in a shared/common area, or your own unit?' → collect_field('common_area', 'Yes' or 'No')\n"
            "   - 'If no one answers, can the technician enter with a master key?' → collect_field('master_key', 'Yes' or 'No')\n"
            "   - 'Any access notes — gate codes, pets, when you're available?' → collect_field('access_notes', <what they said, or 'None'>)\n"
            "9. Once you have all of that, call create_work_order(...). If search_customer found their "
            "record, its phone number is already in your context — use that, don't ask the caller to "
            "repeat it. Then tell the caller their work order number and that a technician will follow up."
        )

    return instructions, locale, voice
