// InsForge Realtime broadcaster
// Called after any DB write to push live updates to connected clients

const FUNCTION_URL = "https://gcj3agx8.function2.insforge.app";
const API_KEY = process.env.INSFORGE_API_KEY || "ik_a8ed83968d699a83aa3d6f3206b6e452";

/**
 * Broadcast a DB change to InsForge Realtime via the edge function
 * @param {string} table - Table name: 'incidents' | 'alerts' | 'incident_logs'
 * @param {string} event - 'INSERT' | 'UPDATE' | 'DELETE'
 * @param {object} record - The new record (for INSERT/UPDATE)
 * @param {object} old_record - The old record (for UPDATE/DELETE)
 */
async function broadcastChange(table, event, record = null, old_record = null) {
  try {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ table, event, record, old_record }),
    });
    if (!res.ok) {
      console.warn(`[realtime] broadcast failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    // Non-fatal — realtime is best-effort
    console.warn("[realtime] broadcast error:", err.message);
  }
}

module.exports = { broadcastChange };
