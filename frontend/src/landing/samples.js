// Illustrative content for the landing page only. Every place that shows it is labelled "Sample".
// Real interviews and debriefs never read from this file.

export const SAMPLE_EXCHANGES = [
  {
    kind: "Question 02 / 05",
    question: "Tell me about a launch that slipped. What did you do?",
    answer:
      "We moved the date by two weeks. I cut the export feature and kept the onboarding fixes, because those drove most of our support tickets.",
  },
  {
    kind: "Follow-up · Question 02",
    question: "You said “we” moved the date. What did you decide, personally?",
    answer: "I made the call to cut export, and I told our VP that afternoon, with the ticket data behind it.",
  },
];

export const SAMPLE_CONFIG = {
  role: "Frontend Engineer",
  level: "Mid",
  style: "Mixed",
  questions: 5,
};

export const SAMPLE_REPORT = {
  overall: 74,
  readiness: "Almost there",
  summary:
    "Clear, well-ordered answers with real outcomes. The weak spot is ownership: you often say “we” where the interviewer needs to hear what you decided.",
  dimensions: [
    { name: "Clarity", score: 8, comment: "Short sentences, one idea at a time." },
    { name: "Depth", score: 6, comment: "Go one level further into trade-offs." },
    { name: "Structure", score: 7, comment: "Situation and result were clear; the action was thin." },
    { name: "Relevance", score: 8, comment: "Answered what was asked." },
    { name: "Evidence", score: 6, comment: "Name a number or a decision, not just a direction." },
  ],
  question: {
    question: "Tell me about a launch that slipped. What did you do?",
    score: 7,
    worked: ["Opened with the outcome", "Explained why onboarding mattered more"],
    improve: ["Say “I”, not “we”, for your own decisions", "Give the size of the ticket drop"],
  },
};

// The interview states, in the order a real answer moves through them.
export const STATES = [
  { id: "speaking", name: "Interviewer speaking", line: "speaking", tag: "Interviewer speaking", text: "Listen to the question. The mic opens when it ends.", about: "The question is read aloud. Your mic stays closed so it doesn't hear the interviewer." },
  { id: "listening", name: "Listening", line: "listening", tag: "Listening", text: "Just start talking.", about: "The mic opens by itself. No button to press, and the line only moves while it's truly listening." },
  { id: "hearing", name: "Hearing you", line: "hearing", tag: "Hearing you", text: "Your words appear below as you speak.", about: "Speech turns into text as you talk. The line turns red while words are coming in." },
  { id: "counting", name: "Silence countdown", line: "counting", tag: "Sending in 2", text: "Keep talking to add more.", about: "Stop for about three seconds and a red rule fills. Speak again and it resets." },
  { id: "sending", name: "Thinking", line: "sending", tag: "Thinking", text: "The interviewer is considering your answer…", about: "Your answer is sent. The interviewer decides: next question, or a follow-up." },
  { id: "typing", name: "Typing", line: "paused", tag: "Typing", text: "Typing this answer. Send it when you're ready.", about: "Start typing at any moment. The mic steps aside and nothing is sent until you choose." },
];
