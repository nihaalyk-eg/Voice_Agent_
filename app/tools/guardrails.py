import os
import boto3
from typing import Optional

class BedrockGuardrails:
    def __init__(self):
        self.guardrail_id = os.environ.get("AWS_GUARDRAIL_ID")
        self.guardrail_version = os.environ.get("AWS_GUARDRAIL_VERSION", "DRAFT")
        
        if self.guardrail_id:
            try:
                self.client = boto3.client("bedrock-runtime", region_name=os.environ.get("AWS_REGION", "us-east-1"))
            except Exception as e:
                print(f"[guardrails] Failed to initialize Bedrock client: {e}")
                self.client = None
        else:
            self.client = None
            print("[guardrails] AWS_GUARDRAIL_ID not set. Running in pass-through mode.")

    def filter_text(self, text: str, source: str = "OUTPUT") -> str:
        """
        Applies the configured Bedrock Guardrail to the provided text.
        Source should be 'INPUT' (user/external) or 'OUTPUT' (model response).
        Returns the sanitized text. If the action is guarded/blocked, it may return a canned response.
        If the client is unavailable, returns the original text.
        """
        if not self.client or not self.guardrail_id or not text.strip():
            return text

        try:
            response = self.client.apply_guardrail(
                guardrailIdentifier=self.guardrail_id,
                guardrailVersion=self.guardrail_version,
                source=source,
                content=[
                    {
                        "text": {"text": text}
                    }
                ]
            )

            action = response.get("action")
            if action == "GUARDRAIL_INTERVENED":
                # Extract the intervened text if outputs are provided
                outputs = response.get("outputs", [])
                if outputs and "text" in outputs[0]:
                    print(f"[guardrails] Text was sanitized by Bedrock. Original length: {len(text)}.")
                    return outputs[0]["text"]
                else:
                    print("[guardrails] Content blocked by Bedrock Guardrail. Returning safe placeholder.")
                    return "Content blocked by safety policy."
            
            return text

        except Exception as e:
            print(f"[guardrails] Error calling Bedrock apply_guardrail: {e}")
            return text

# Global instance for use across tools and agents
guardrail_filter = BedrockGuardrails()
