// Single source of truth for the portfolio index.
// Edit a case here: title, tagline, tags, platform, status, Figma link, cover.
// status: "ready" (case finished in Figma) · "wip" (in progress) · "planned"
// cover: path relative to the site root, or null → a styled placeholder is shown.
// accent: placeholder colour only; each case page uses its own tokens.
window.CASES = [
  {
    n: "01", slug: "01-rosterline", title: "Rosterline",
    tagline: "Rebook a sick day in 35 minutes, not 2 hours.",
    tags: ["Healthcare SaaS", "Provider scheduling"],
    platform: "Web SaaS + iOS", status: "ready",
    figma: "https://www.figma.com/design/Xpl0Fa7f8VpRiwWe2F6znZ",
    cover: null, accent: "#3B4CCA"
  },
  {
    n: "02", slug: "02-attest", title: "Attest",
    tagline: "A note you review in 3 minutes — with proof.",
    tags: ["Healthcare AI", "Ambient scribe"],
    platform: "iOS · Apple Watch · Web", status: "ready",
    figma: "https://www.figma.com/design/36fjAO68F9iPxaKCT7K50i",
    cover: null, accent: "#5B3FD9"
  },
  {
    n: "03", slug: "03-visitready", title: "VisitReady",
    tagline: "Check in from the couch, not the waiting room.",
    tags: ["Patient app", "Digital check-in", "Telehealth"],
    platform: "iOS · Android · mobile web", status: "wip",
    figma: "https://www.figma.com/design/YxaZkKeULhsAPNH6qI1GjX",
    cover: null, accent: "#0F5E63"
  },
  {
    n: "04", slug: "04-baseline-rpm", title: "Baseline RPM",
    tagline: "A care-team console for remote patient monitoring.",
    tags: ["Clinician tools", "RPM"],
    platform: "Web", status: "planned", figma: null, cover: null, accent: "#1F6F50"
  },
  {
    n: "05", slug: "05-titra", title: "Titra",
    tagline: "A GLP-1 weight-management program patients stay on.",
    tags: ["Patient app", "Chronic care"],
    platform: "Mobile", status: "planned", figma: null, cover: null, accent: "#B4532A"
  },
  {
    n: "06", slug: "06-carefill", title: "Carefill",
    tagline: "Home care: fill caregiver call-offs fast, with EVV built in.",
    tags: ["Home care", "Workforce"],
    platform: "Web + mobile", status: "planned", figma: null, cover: null, accent: "#7A4FA3"
  },
  {
    n: "07", slug: "07-enamel", title: "Enamel",
    tagline: "AI X-ray findings patients understand — and treatment they accept.",
    tags: ["Dental", "Healthcare AI"],
    platform: "Web + tablet", status: "planned", figma: null, cover: null, accent: "#2B6CB0"
  },
  {
    n: "08", slug: "08-clearlane", title: "Clearlane",
    tagline: "Referrals and prior authorization without the fax loop.",
    tags: ["Revenue cycle", "Ops SaaS"],
    platform: "Web", status: "planned", figma: null, cover: null, accent: "#2F7D6D"
  },
  {
    n: "09", slug: "09-baton", title: "Baton",
    tagline: "Shift handoff (I-PASS) and nurse workload in one view.",
    tags: ["Clinician tools", "Nursing"],
    platform: "Tablet + web", status: "planned", figma: null, cover: null, accent: "#C2410C"
  },
  {
    n: "10", slug: "10-readout", title: "Readout",
    tagline: "At-home lab tests with results people can actually read.",
    tags: ["Patient app", "Diagnostics"],
    platform: "Mobile", status: "planned", figma: null, cover: null, accent: "#0E7490"
  },
  {
    n: "11", slug: "11-rounds", title: "Rounds",
    tagline: "Take-home up from $285 to $308 an hour, with an agent on your side.",
    tags: ["Healthcare staffing", "Mobile app"],
    platform: "iOS 26 · 157 screens", status: "ready",
    figma: "https://www.figma.com/design/WJLm1lMxLmretjcMmGhqRy",
    cover: null, accent: "#1E3A5F"
  }
];
