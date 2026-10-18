export const WISP_PLACEHOLDERS = [
  "Ask away. Wisp is listening…",
  "What’s on your mind?",
  "Let’s find something out…",
  "Curious? Ask Wisp.",
  "Drop a question. Get a little clarity.",
  "Your next answer starts here…",
  "Wonder out loud…",
  "Ask Wisp. Uncover more.",
];

export const WISP_WELCOME_MESSAGES = [
  "Hey! What are we figuring out today?",
  "Psst… Wisp is all ears.",
  "Hello, curious mind. What's on your mind?",
  "Got a question? Let's chase the answer.",
  "Hey there! Let's make sense of it.",
  "A little curiosity goes a long way. Ask away.",
  "Your thoughts, my next mission.",
  "Well, hello there. What shall we explore?",
];

export const WISP_LOADING_MESSAGES = [
  "Wisp is on the case…",
  "Wisp is connecting the dots…",
  "Wisp is digging up answers…",
  "Wisp is chasing down the details…",
  "Wisp is weaving through knowledge…",
  "Wisp is finding your missing piece…",
  "Wisp is brewing up an answer…",
  "Wisp is exploring its little universe…",
  "Wisp is thinking things through…",
  "Wisp is searching the knowledge vault…",
];

export function getRandomWelcomeMessage(): string {
  const idx = Math.floor(Math.random() * WISP_WELCOME_MESSAGES.length);
  return WISP_WELCOME_MESSAGES[idx];
}
