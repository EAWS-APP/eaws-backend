// In-memory mock database for EAWS sync when offline or in fallback mode
const mockProfiles = {
  "c-001": { user_id: "c-001", full_name: "D. Harrison", phone: "+233 54 882 9912", user_role: "citizen", operator_code: "GH-ACR-8829-44", is_approved: true },
  "c-002": { user_id: "c-002", full_name: "Ama Serwaa Boateng", phone: "+233 20 111 2233", user_role: "citizen", operator_code: "GH-ACR-7723-09", is_approved: true },
  "c-003": { user_id: "c-003", full_name: "Kwame Asante", phone: "+233 24 555 7788", user_role: "citizen", operator_code: "GH-ACR-5501-21", is_approved: true },
  "c-004": { user_id: "c-004", full_name: "Nana Mensah", phone: "+233 50 909 1010", user_role: "citizen", operator_code: "GH-ACR-3312-17", is_approved: false },
  "c-005": { user_id: "c-005", full_name: "Abena Osei-Bonsu", phone: "+233 27 456 8801", user_role: "citizen", operator_code: "GH-ACR-1189-44", is_approved: true }
};

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

module.exports = {
  mockProfiles,
  mockIncidents,
  mockComments,
  mockReactions
};
