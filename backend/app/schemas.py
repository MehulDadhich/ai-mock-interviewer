from typing import Literal

from pydantic import BaseModel, Field

Seniority = Literal["intern", "junior", "mid", "senior", "lead"]
InterviewType = Literal["behavioral", "technical", "mixed"]


# ---- API requests / responses -------------------------------------------------

class StartRequest(BaseModel):
    role: str = Field(min_length=2, max_length=80)
    seniority: Seniority = "mid"
    interview_type: InterviewType = "mixed"
    num_questions: int = Field(default=5, ge=3, le=8)
    job_description: str = Field(default="", max_length=6000)


class AnswerRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=6000)


class EndRequest(BaseModel):
    # The answer the candidate was giving when they ended (recorded without asking another question).
    answer: str = Field(default="", max_length=6000)
    # "warnings": ended automatically on the third warning (left the tab, or an extension was detected).
    reason: Literal["submitted", "warnings"] = "submitted"


class TurnResponse(BaseModel):
    session_id: str
    message: str
    kind: Literal["question", "follow_up", "closing"]
    question_number: int
    total_questions: int
    done: bool


# ---- JSON schemas the model's replies must match --------------------------------
# Hand-written so they stay within what structured outputs supports
# (no numeric min/max; ranges are stated in the prompt instead).

TURN_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {
            "type": "string",
            "description": "Exactly what the interviewer says out loud next.",
        },
        "action": {"type": "string", "enum": ["question", "follow_up", "wrap_up"]},
    },
    "required": ["reply", "action"],
    "additionalProperties": False,
}

DIMENSIONS = ["Clarity", "Depth", "Structure", "Relevance", "Evidence"]
READINESS = ["Ready", "Almost there", "Needs practice", "Not yet"]

REPORT_SCHEMA = {
    "type": "object",
    "properties": {
        "overall_score": {"type": "integer", "description": "0-100"},
        "readiness": {"type": "string", "enum": READINESS},
        "summary": {"type": "string"},
        "dimensions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "enum": DIMENSIONS},
                    "score": {"type": "integer", "description": "1-10"},
                    "comment": {"type": "string"},
                },
                "required": ["name", "score", "comment"],
                "additionalProperties": False,
            },
        },
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "score": {"type": "integer", "description": "1-10"},
                    "what_worked": {"type": "array", "items": {"type": "string"}},
                    "to_improve": {"type": "array", "items": {"type": "string"}},
                    "stronger_answer": {"type": "string"},
                },
                "required": ["question", "score", "what_worked", "to_improve", "stronger_answer"],
                "additionalProperties": False,
            },
        },
        "next_steps": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["overall_score", "readiness", "summary", "dimensions", "questions", "next_steps"],
    "additionalProperties": False,
}
