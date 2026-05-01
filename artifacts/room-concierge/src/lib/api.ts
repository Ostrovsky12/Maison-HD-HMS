const getBaseUrl = () => {
  const base = import.meta.env.BASE_URL || "/";
  // Remove /room-concierge if it exists and append /api
  return base.replace(/\/room-concierge\/?$/, "") + "/api/room-concierge";
};

export const api = {
  getTerminal: async (orgSlug: string, unitId: string) => {
    const res = await fetch(`${getBaseUrl()}/terminal/${orgSlug}/${unitId}`);
    if (!res.ok) throw new Error("Failed to get terminal info");
    return res.json();
  },
  
  chat: async (data: { orgSlug: string, unitId: string, sessionId: string, message: string, history: any[], guestName: string }) => {
    const res = await fetch(`${getBaseUrl()}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to chat");
    return res.json();
  },
  
  getAdminReplies: async (sessionId: string) => {
    const res = await fetch(`${getBaseUrl()}/admin/replies/${sessionId}`);
    if (!res.ok) throw new Error("Failed to get admin replies");
    return res.json();
  },
  
  // Admin panel API
  getRequests: async (token: string) => {
    const res = await fetch(`${getBaseUrl()}/requests`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to get requests");
    return res.json();
  },
  
  updateRequest: async (id: string, adminReply: string, status: string, token: string) => {
    const res = await fetch(`${getBaseUrl()}/requests/${id}`, {
      method: "PATCH",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ adminReply, status })
    });
    if (!res.ok) throw new Error("Failed to update request");
    return res.json();
  },
  
  getKnowledge: async (token: string) => {
    const res = await fetch(`${getBaseUrl()}/knowledge`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to get knowledge");
    return res.json();
  },
  
  createKnowledge: async (data: any, token: string) => {
    const res = await fetch(`${getBaseUrl()}/knowledge`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to create knowledge");
    return res.json();
  },
  
  updateKnowledge: async (id: string, data: any, token: string) => {
    const res = await fetch(`${getBaseUrl()}/knowledge/${id}`, {
      method: "PUT",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to update knowledge");
    return res.json();
  },
  
  deleteKnowledge: async (id: string, token: string) => {
    const res = await fetch(`${getBaseUrl()}/knowledge/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to delete knowledge");
    return res.json();
  },
  
  seedKnowledge: async (token: string) => {
    const res = await fetch(`${getBaseUrl()}/knowledge/seed`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to seed knowledge");
    return res.json();
  }
};