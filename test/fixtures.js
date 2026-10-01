// A small Brella JSON:API timeslots payload with the same shape as the real
// https://api.brella.io/api/public/events/wavebyvento2026/timeslots?date=all
const speaker = (id, first, last, job, company, bio) => ({
  id,
  type: "public-speaker",
  attributes: { honorific: null, "first-name": ` ${first} `, "middle-name": null, "last-name": last, "job-title": job, "company-name": company, bio },
});
const assignment = (id, speakerId, role, position) => ({
  id,
  type: "public-speaker-assignment",
  attributes: { role, position },
  relationships: { speaker: { data: { id: speakerId, type: "public-speaker" } } },
});
const slot = (id, title, location, start, end, { tags = [], speakers = [], content = null, cap = null } = {}) => ({
  id,
  type: "public-timeslot",
  attributes: { title, location, "start-time": start, "end-time": end, content, "attendance-cap": cap },
  relationships: {
    tags: { data: tags.map((t) => ({ id: t, type: "public-tag" })) },
    "speaker-assignments": { data: speakers.map((a) => ({ id: a, type: "public-speaker-assignment" })) },
  },
});

export const BRELLA_FIXTURE = {
  data: [
    slot("2", "Designing the World We Live In", "Fucine", "2026-10-07T10:12:00.000Z", "2026-10-07T10:57:00.000Z", {
      speakers: ["a3", "a1", "a2"],
      content: { blocks: [{ text: "Design, industry and taste." }, { text: "" }, { text: "A conversation." }] },
    }),
    slot("1", "AI in SMEs: three impacts no one saw coming", "Room A", "2026-10-08T07:30:00.000Z", "2026-10-08T08:15:00.000Z", {
      tags: ["t-mc"],
      speakers: ["a4"],
      content: JSON.stringify({ blocks: [{ text: "Practical AI for small companies." }] }),
      cap: 70,
    }),
    slot("3", "The a16z Show", "Room C", "2026-10-07T09:30:00.000Z", "2026-10-07T10:00:00.000Z", { tags: ["t-pod"] }),
    slot("4", "Pitch Session: Health & Biotech", "Investor Lounge", "2026-10-07T14:00:00.000Z", "2026-10-07T15:00:00.000Z"),
    slot("5", null, "Networking Area", "2026-10-07T07:00:00.000Z", "2026-10-07T07:20:00.000Z"),
    slot("6", "Broken", "Fucine", "not a date", null),
  ],
  included: [
    speaker("10", "Jony", "Ive", "Founder", "LoveFrom", { blocks: [{ text: "Designer." }] }),
    speaker("11", "John", "Elkann", "CEO & Chairman", "Exor, Stellantis & Ferrari", null),
    speaker("12", "Zanny", "Minton Beddoes", "Editor-in-Chief", "The Economist", null),
    speaker("13", "Yuri", "Mariotti", "Fractional CAIO", "", null),
    assignment("a1", "10", "Speaker", 1),
    assignment("a2", "11", "Speaker", 2),
    assignment("a3", "12", "Moderator", 3),
    assignment("a4", "13", "Speaker", 1),
    { id: "t-mc", type: "public-tag", attributes: { name: "Masterclass" } },
    { id: "t-pod", type: "public-tag", attributes: { name: "Podcast" } },
  ],
};

export const json = (data) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
export const html = (body) => new Response(body, { status: 200, headers: { "content-type": "text/html" } });
