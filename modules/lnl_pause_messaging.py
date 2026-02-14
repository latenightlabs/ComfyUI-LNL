from server import PromptServer
from aiohttp import web
from comfy.model_management import InterruptProcessingException, throw_exception_if_processing_interrupted
import time, json
from typing import Optional
from .audio_preview import get_video_audio_preview, get_video_audio_envelope

REQUEST_RESHOW = "-1"
CANCEL = "-3"
WAITING_FOR_RESPONSE = "-9"

class Response:
    def __init__(
        self,
        current_frame: Optional[int] = None,
        in_point: Optional[int] = None,
        out_point: Optional[int] = None,
        select_every_nth_frame: Optional[int] = None,
        special: Optional[str] = None,
        graph_id: Optional[str] = None,
    ):
        self.current_frame = int(current_frame) if current_frame is not None else None
        self.in_point = int(in_point) if in_point is not None else None
        self.out_point = int(out_point) if out_point is not None else None
        self.select_every_nth_frame = int(select_every_nth_frame) if select_every_nth_frame is not None else None
        self.special = special
        self.graph_id = graph_id

class TimeoutResponse(Response):
    pass

class CancelledResponse(Response):
    pass

class RequestResponse(Response):
    pass

class MessageState:
    _latest: "Optional[MessageState]" = None
    graph_id_expected = None

    def __init__(self, data: dict | str | None = None):
        if data is None:
            data = {}
        data_dict: dict = data if isinstance(data, dict) else json.loads(data)
        self.graph_id: Optional[str] = data_dict.pop("graph_id", None)
        self.special: Optional[str] = data_dict.pop("special", None)
        self.response: Response = Response(**data_dict, special=self.special, graph_id=self.graph_id)

    @classmethod
    def latest(cls) -> "MessageState":
        if cls._latest is None:
            cls._latest = cls()
        return cls._latest

    @classmethod
    def set_latest(cls, latest: "MessageState"):
        cls._latest = latest

    @classmethod
    def waiting_state(cls):
        return MessageState(data={"special": WAITING_FOR_RESPONSE})

    @classmethod
    def request_state(cls):
        return MessageState(data={"special": REQUEST_RESHOW})

    @classmethod
    def start_waiting(cls, graph_id):
        cls._latest = cls.waiting_state()
        cls.graph_id_expected = graph_id

    @classmethod
    def get_response(cls) -> Response:
        if cls.waiting():
            return TimeoutResponse()
        if cls.latest().cancelled:
            return CancelledResponse()
        if cls.latest().request:
            return RequestResponse()
        return cls.latest().response

    @classmethod
    def stop_waiting(cls):
        cls._latest = MessageState()

    @classmethod
    def waiting(cls) -> bool:
        return cls.latest().special == WAITING_FOR_RESPONSE

    @property
    def cancelled(self) -> bool:
        return self.special == CANCEL

    @property
    def request(self) -> bool:
        return self.special == REQUEST_RESHOW

    @property
    def real(self) -> bool:
        return self.special is None


@PromptServer.instance.routes.post("/lnl-frame-selector-message")
async def lnl_frame_selector_message(request):
    post = await request.post()
    response = post.get("response")
    if not response:
        return web.json_response({})
    message = MessageState(response)

    if str(MessageState.graph_id_expected) == str(message.graph_id):
        if MessageState.waiting():
            MessageState.set_latest(message)
    return web.json_response({})


@PromptServer.instance.routes.get("/lnl-frame-selector-audio-preview")
async def lnl_frame_selector_audio_preview(request):
    filename = request.rel_url.query.get("filename")
    if not filename:
        return web.json_response({"preview": None, "envelope": None})
    total_frames_raw = request.rel_url.query.get("total_frames")
    try:
        total_frames = int(total_frames_raw) if total_frames_raw is not None else 0
    except (TypeError, ValueError):
        total_frames = 0
    bins = min(240, total_frames) if total_frames and total_frames > 0 else 240
    preview = get_video_audio_preview(filename)
    envelope = get_video_audio_envelope(filename, bins=bins)
    return web.json_response({"preview": preview, "envelope": envelope})


def wait_for_response(secs, uid, graph_id) -> Response:
    MessageState.start_waiting(graph_id)
    try:
        end_time = time.monotonic() + secs
        while time.monotonic() < end_time and MessageState.waiting():
            throw_exception_if_processing_interrupted()
            PromptServer.instance.send_sync(
                "lnl-frame-selector-pause",
                {"tick": int(end_time - time.monotonic()), "uid": uid, "graph_id": graph_id},
            )
            time.sleep(0.5)
        if MessageState.waiting():
            PromptServer.instance.send_sync(
                "lnl-frame-selector-pause",
                {"timeout": True, "uid": uid, "graph_id": graph_id},
            )
        return MessageState.get_response()
    finally:
        MessageState.stop_waiting()


def send_and_wait(payload, timeout, uid, graph_id) -> Response:
    payload["uid"] = uid
    payload["graph_id"] = graph_id

    while True:
        PromptServer.instance.send_sync("lnl-frame-selector-pause", payload)
        r = wait_for_response(timeout, uid, graph_id)
        if isinstance(r, CancelledResponse):
            raise InterruptProcessingException()
        if not isinstance(r, RequestResponse):
            return r


def send_progress(uid, graph_id, message: str, current: int | None = None, total: int | None = None):
    PromptServer.instance.send_sync(
        "lnl-frame-selector-progress",
        {"uid": uid, "graph_id": graph_id, "message": message, "current": current, "total": total},
    )
