from livekit.api import LiveKitAPI
import asyncio
async def main():
    api = LiveKitAPI("ws://livekit:7880", "key", "secret")
    print(api._client._url)
asyncio.run(main())
