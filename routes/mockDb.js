// In-memory mock database for EAWS sync when offline or in fallback mode
// ── Persistence layer: read/write to data/*.json so posts survive restarts ──
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(filename, fallback) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }
  } catch (e) {
    console.warn(`⚠️ Failed to read ${filename}, using defaults:`, e.message);
  }
  return fallback;
}

function writeJson(filename, data) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn(`⚠️ Failed to write ${filename}:`, e.message);
  }
}

// ── User Identity Registry ────────────────────────────────────────────────────
// Central registry mapping user IDs / emails to their verified registered name.
// This is the single source of truth for who posted what, on BOTH mobile and web.
const mockProfiles = {
  // Registered citizens — keyed by user_id
  "c-001": { user_id: "c-001", full_name: "D. Harrison", email: "d.harrison@eaws.gov.gh", phone: "+233 54 882 9912", user_role: "citizen", operator_code: "GH-ACR-8829-44", is_approved: true, is_active: true },
  "c-002": { user_id: "c-002", full_name: "Ama Serwaa Boateng", email: "ama.boateng@eaws.gov.gh", phone: "+233 20 111 2233", user_role: "citizen", operator_code: "GH-ACR-7723-09", is_approved: true, is_active: true },
  "c-003": { user_id: "c-003", full_name: "Kwame Asante", email: "kwame@eaws.gov.gh", phone: "+233261234567", user_role: "citizen", operator_code: "GH-ACR-5501-21", is_approved: true, is_active: true },
  "c-004": { user_id: "c-004", full_name: "Nana Mensah", email: "nana.mensah@eaws.gov.gh", phone: "+233 50 909 1010", user_role: "citizen", operator_code: "GH-ACR-3312-17", is_approved: false, is_active: true },
  "c-005": { user_id: "c-005", full_name: "Abena Osei-Bonsu", email: "abena.osei@eaws.gov.gh", phone: "+233 27 456 8801", user_role: "citizen", operator_code: "GH-ACR-1189-44", is_approved: true, is_active: true },
  // Mock auth token identities (offline / simulator mode)
  "mock-id-citizen": { user_id: "mock-id-citizen", full_name: "Kwame Asante", email: "kwame@eaws.gov.gh", phone: "+233261234567", user_role: "citizen", operator_code: "GH-ACR-5501-21", is_approved: true, is_active: true },
  "mock-id-dispatcher": { user_id: "mock-id-dispatcher", full_name: "EAWS Dispatcher", email: "dispatcher@eaws.gov.gh", phone: "+233 30 000 0001", user_role: "dispatcher", operator_code: "DISP-0001", is_approved: true, is_active: true }
};

// Also index profiles by email for fast lookups when mobile sends JWT tokens
const mockProfilesByEmail = {};
for (const [id, profile] of Object.entries(mockProfiles)) {
  if (profile.email) mockProfilesByEmail[profile.email.toLowerCase()] = profile;
}

/**
 * Resolve the authoritative full name for a given user in a request.
 * Priority: Supabase user metadata full_name → registry by ID → registry by email → fallback.
 */
function resolveAuthorName(authUser) {
  if (!authUser) return 'Ghana Citizen';

  // 1. Trust full_name if it's set in user_metadata and is a real name (not a raw email/phone)
  const metaName = authUser.user_metadata && authUser.user_metadata.full_name;
  if (metaName && metaName.trim() && metaName !== 'Ghana Citizen' && !metaName.includes('@') && !/^\+?\d/.test(metaName)) {
    return metaName.trim();
  }

  // 2. Look up by user ID in our registry
  const byId = mockProfiles[authUser.id];
  if (byId && byId.full_name) return byId.full_name;

  // 3. Look up by email
  if (authUser.email) {
    const byEmail = mockProfilesByEmail[authUser.email.toLowerCase()];
    if (byEmail && byEmail.full_name) return byEmail.full_name;
  }

  // 4. Format from email handle (e.g. kwame.asante@eaws.gov.gh → Kwame Asante)
  if (authUser.email && authUser.email.includes('@')) {
    const handle = authUser.email.split('@')[0].replace(/[._-]/g, ' ');
    const formatted = handle.split(' ')
      .filter(w => w.length > 0)
      .map(w => w[0].toUpperCase() + w.slice(1))
      .join(' ');
    if (formatted) return formatted;
  }

  return 'Ghana Citizen';
}

// ── Mock Incidents (permanent seed data) ─────────────────────────────────────
const mockIncidents = [
  {
    id: "inc-1",
    title: "Rising water levels on Liberation Road",
    category: "flood",
    emergency_type: "flood",
    severity: "CRITICAL",
    status: "pending",
    description: "Water has reached knee level near the traffic light. Avoid the area and seek alternative bypass routes.",
    latitude: 5.5560,
    longitude: -0.1962,
    location_name: "Liberation Road, Accra",
    is_verified: true,
    is_anonymous: false,
    created_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    likes_count: 24,
    comments_count: 1,
    views_count: 312,
    reporter_id: "c-003",
    user_id: "c-003",
    user_name: "Kwame Asante",
    reporter_profile: {
      full_name: "Kwame Asante",
      user_role: "citizen",
      operator_code: "GH-ACR-5501-21"
    }
  },
  {
    id: "inc-2",
    title: "Bushfire spotted near Achimota Forest",
    category: "fire",
    emergency_type: "fire",
    severity: "WARNING",
    status: "assigned",
    description: "Thick smoke visible from the main road. Fire service has been called and dispatchers are en-route.",
    latitude: 5.6147,
    longitude: -0.2105,
    location_name: "Achimota Forest, Accra",
    is_verified: true,
    is_anonymous: false,
    created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    likes_count: 12,
    comments_count: 0,
    views_count: 188,
    reporter_id: "c-002",
    user_id: "c-002",
    user_name: "Ama Serwaa Boateng",
    reporter_profile: {
      full_name: "Ama Serwaa Boateng",
      user_role: "citizen",
      operator_code: "GH-ACR-7723-09"
    }
  },
  {
    id: "inc-3",
    title: "Injured person near Tema Station",
    category: "medical",
    emergency_type: "medical",
    severity: "MEDIUM",
    status: "resolved",
    description: "Someone collapsed near the bus terminal. Ambulance has been contacted and is currently on the way.",
    latitude: 5.6844,
    longitude: 0.0118,
    location_name: "Tema Station, Accra",
    is_verified: true,
    is_anonymous: false,
    created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    likes_count: 6,
    comments_count: 0,
    views_count: 87,
    reporter_id: "c-004",
    user_id: "c-004",
    user_name: "Nana Mensah",
    reporter_profile: {
      full_name: "Nana Mensah",
      user_role: "citizen",
      operator_code: "GH-ACR-3312-17"
    }
  },
  {
    id: "INC-8829-X",
    title: "Structure Fire - Makola Market",
    category: "fire",
    emergency_type: "fire",
    severity: "CRITICAL",
    status: "assigned",
    description: "Large blaze reported in sector 3 of Makola Market. Multiple vendor structures involved.",
    latitude: 5.5458,
    longitude: -0.2078,
    location_name: "Makola Market, Accra",
    is_verified: true,
    is_anonymous: false,
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    likes_count: 5,
    comments_count: 2,
    views_count: 120,
    reporter_id: "c-001",
    user_id: "c-001",
    user_name: "D. Harrison",
    reporter_profile: {
      full_name: "D. Harrison",
      user_role: "citizen",
      operator_code: "GH-ACR-8829-44"
    }
  },
  {
    id: "INC-1209-A",
    title: "Armed Robbery - East Legon",
    category: "police",
    emergency_type: "police",
    severity: "HIGH",
    status: "assigned",
    description: "Suspects fled in a black sedan after residential break-in. Police unit dispatched.",
    latitude: 5.6322,
    longitude: -0.1654,
    location_name: "East Legon, Accra",
    is_verified: true,
    is_anonymous: false,
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    likes_count: 12,
    comments_count: 1,
    views_count: 95,
    reporter_id: "c-005",
    user_id: "c-005",
    user_name: "Abena Osei-Bonsu",
    reporter_profile: {
      full_name: "Abena Osei-Bonsu",
      user_role: "citizen",
      operator_code: "GH-ACR-1189-44"
    }
  },
  {
    id: "INC-7701-J",
    title: "Suspicious Vehicle Activity - Osu RE",
    category: "police",
    emergency_type: "police",
    severity: "MEDIUM",
    status: "resolved",
    description: "Unmarked vehicle lingering near commercial bank. Vehicle cleared by security team.",
    latitude: 5.5560,
    longitude: -0.1812,
    location_name: "Osu RE, Accra",
    is_verified: true,
    is_anonymous: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 43).toISOString(),
    likes_count: 3,
    comments_count: 0,
    views_count: 64,
    reporter_id: "c-006",
    user_id: "c-006",
    user_name: "Jayden Spark",
    reporter_profile: {
      full_name: "Jayden Spark",
      user_role: "citizen",
      operator_code: "GH-ACR-9921-77"
    }
  }
];

const mockComments = {
  "inc-1": [
    {
      id: "comment-1",
      incident_id: "inc-1",
      user_id: "c-002",
      content: "I just passed through there; it's really bad. Stay away!",
      created_at: new Date(Date.now() - 1000 * 60 * 1).toISOString(),
      user_profile: {
        full_name: "Ama Serwaa Boateng",
        user_role: "citizen"
      }
    }
  ],
  "INC-8829-X": [
    {
      id: "comment-2",
      incident_id: "INC-8829-X",
      user_id: "c-003",
      content: "Fire service just arrived. High smoke columns.",
      created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      user_profile: {
        full_name: "Kwame Asante",
        user_role: "citizen"
      }
    },
    {
      id: "comment-3",
      incident_id: "INC-8829-X",
      user_id: "3df6b4d4-5809-41b1-8682-688d536aff25",
      content: "Units dispatched from central station. Clear road access.",
      created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
      user_profile: {
        full_name: "Central Dispatcher",
        user_role: "dispatcher",
        operator_code: "DISP-0001"
      }
    }
  ],
  "INC-1209-A": [
    {
      id: "comment-4",
      incident_id: "INC-1209-A",
      user_id: "e7bbcbc3-ae82-443f-87f2-11ac0777dd0a",
      content: "Patrol car is on the scene. Stay indoors.",
      created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      user_profile: {
        full_name: "Police Operator",
        user_role: "police",
        operator_code: "POL-0021"
      }
    }
  ]
};

const mockReactions = {};

// ── In-memory community posts (free-form messages, not formal incidents) ────────
// Seed data — used only if no saved data exists yet
const seedCommunityPosts = [
  {
    id: 'cp-001',
    post_type: 'community',
    content: 'Anyone else notice the traffic is really bad on the N1 highway this morning? Took me 45 minutes from Spintex to Accra Mall. Stay safe out there everyone 🙏',
    author_id: 'c-001',
    author_name: 'D. Harrison',
    author_initials: 'DH',
    is_verified: true,
    created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    replies_count: 2,
    likes_count: 7,
    replies: [
      { id: 'cpr-001', post_id: 'cp-001', author_name: 'Ama Serwaa Boateng', author_initials: 'AS', content: 'Yes! Same here. I heard there was an accident near Tetteh Quarshie. Take the Legon route.', created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
      { id: 'cpr-002', post_id: 'cp-001', author_name: 'Kwame Asante', author_initials: 'KA', content: 'Thanks for the heads up! Switching routes now.', created_at: new Date(Date.now() - 1000 * 60 * 3).toISOString() }
    ]
  },
  {
    id: 'cp-002',
    post_type: 'community',
    content: 'Heads up: The Electricity Company is doing maintenance work in East Legon areas 12 and 13 today from 9am to 4pm. Power will be out. Charge your devices now! ⚡',
    author_id: 'c-003',
    author_name: 'Kwame Asante',
    author_initials: 'KA',
    is_verified: true,
    created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    replies_count: 1,
    likes_count: 21,
    replies: [
      { id: 'cpr-003', post_id: 'cp-002', author_name: 'Nana Mensah', author_initials: 'NM', content: 'Thank you! Good to know. Will buy ice for the fridge 😅', created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString() }
    ]
  }
];

// Load persisted data, falling back to seed defaults
const mockCommunityPosts = readJson('community_posts.json', null);
if (!mockCommunityPosts) {
  // First run — no saved file yet, use seed data
  var _communityPosts = [...seedCommunityPosts];
} else {
  // Merge: saved posts take priority, seed posts fill in any missing IDs
  const savedIds = new Set(mockCommunityPosts.map(p => p.id));
  const merged = [...mockCommunityPosts];
  for (const seed of seedCommunityPosts) {
    if (!savedIds.has(seed.id)) merged.push(seed);
  }
  var _communityPosts = merged;
}

// Also restore persisted incidents (user-created ones) and re-attach author identity
const savedIncidents = readJson('incidents.json', null);
if (savedIncidents && Array.isArray(savedIncidents)) {
  const existingIds = new Set(mockIncidents.map(i => i.id));
  for (const inc of savedIncidents) {
    if (!existingIds.has(inc.id)) {
      // Re-hydrate reporter_profile from registry so names never go stale
      const profile = mockProfiles[inc.reporter_id] || mockProfiles[inc.user_id];
      if (profile) {
        inc.user_name = profile.full_name;
        inc.reporter_profile = {
          full_name: profile.full_name,
          user_role: profile.user_role,
          operator_code: profile.operator_code
        };
      }
      mockIncidents.push(inc);
    }
  }
}

// Restore persisted comments
const savedComments = readJson('comments.json', null);
if (savedComments && typeof savedComments === 'object') {
  for (const [incId, comments] of Object.entries(savedComments)) {
    if (!mockComments[incId]) {
      mockComments[incId] = comments;
    } else {
      const existingIds = new Set(mockComments[incId].map(c => c.id));
      for (const c of comments) {
        if (!existingIds.has(c.id)) mockComments[incId].push(c);
      }
    }
  }
}

// Restore persisted messages
let mockMessages = {}; // keyed by citizen user_id, array of message objects
const savedMessages = readJson('messages.json', null);
if (savedMessages && typeof savedMessages === 'object') {
  mockMessages = savedMessages;
}

// Replace the module-level array reference so community.js mutations are persisted
// (JavaScript arrays are reference types, so routes mutating this array will mutate _communityPosts)
const finalCommunityPosts = _communityPosts;

// ── Persistence flush functions ─────────────────────────────────────────────────
function saveCommunityPosts() {
  writeJson('community_posts.json', finalCommunityPosts);
}

function saveIncidents() {
  writeJson('incidents.json', mockIncidents);
}

function saveComments() {
  writeJson('comments.json', mockComments);
}

function saveMessages() {
  writeJson('messages.json', mockMessages);
}

function saveToDisk() {
  saveCommunityPosts();
  saveIncidents();
  saveComments();
  saveMessages();
}

console.log(`📂 EAWS MockDB loaded: ${mockIncidents.length} incidents, ${finalCommunityPosts.length} community posts`);

module.exports = {
  mockProfiles,
  mockProfilesByEmail,
  mockIncidents,
  mockComments,
  mockReactions,
  mockCommunityPosts: finalCommunityPosts,
  resolveAuthorName,
  saveToDisk,
  saveCommunityPosts,
  saveIncidents,
  saveComments,
  mockMessages,
  saveMessages
};
