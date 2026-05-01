import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const TYPE_EMOJIS: Record<string, string> = {
  "food": "🍽️",
  "spa": "💆",
  "maintenance": "🔧",
  "cleaning": "🧹",
  "general": "ℹ️"
};

const TYPE_LABELS: Record<string, string> = {
  "food": "Їжа",
  "spa": "SPA",
  "maintenance": "Техніка",
  "cleaning": "Прибирання",
  "general": "Загальне"
};

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  
  const [requests, setRequests] = useState<any[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  
  // Auth check
  useEffect(() => {
    const saved = localStorage.getItem("concierge_admin_pwd");
    if (saved === "admin1234") {
      setIsAuthenticated(true);
      fetchData();
    }
  }, []);

  const handleLogin = () => {
    if (password === "admin1234") {
      localStorage.setItem("concierge_admin_pwd", password);
      setIsAuthenticated(true);
      fetchData();
    } else {
      alert("Невірний пароль");
    }
  };

  const fetchData = async () => {
    try {
      const token = localStorage.getItem("hms_token") || "mock-token";
      
      try {
        const reqs = await api.getRequests(token);
        setRequests(Array.isArray(reqs) ? reqs : []);
      } catch (e) {
        console.error(e);
        // Mock data fallback if API fails
        setRequests([
          { id: "1", type: "food", status: "pending", guestName: "Олексій", unitName: "101", request_text: "Замовте мені каву в номер", created_at: new Date().toISOString() },
          { id: "2", type: "cleaning", status: "completed", guestName: "Ірина", unitName: "204", request_text: "Потрібні свіжі рушники", created_at: new Date().toISOString(), admin_reply: "Рушники доставлено." }
        ]);
      }
      
      try {
        const know = await api.getKnowledge(token);
        setKnowledge(Array.isArray(know) ? know : []);
      } catch (e) {
        console.error(e);
        setKnowledge([
          { id: "1", category: "facilities", title: "Ресторан", content: "Ресторан працює з 7:00 до 23:00. Сніданок шведський стіл з 7:00 до 10:30." },
          { id: "2", category: "services", title: "SPA-центр", content: "Басейн та сауни працюють з 8:00 до 22:00. Для гостей готелю відвідування безкоштовне." }
        ]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReply = async (id: string) => {
    const reply = replyText[id];
    if (!reply) return;
    
    try {
      const token = localStorage.getItem("hms_token") || "mock-token";
      await api.updateRequest(id, reply, "completed", token);
      fetchData();
    } catch (e) {
      console.error(e);
      // Optimistic update for mock
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: "completed", admin_reply: reply } : r));
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 space-y-4">
            <h1 className="text-2xl font-bold text-center">Вхід в адмін-панель</h1>
            <Input 
              type="password" 
              placeholder="Пароль..." 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
            />
            <Button onClick={handleLogin} className="w-full">Увійти</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Room Concierge — Адмін</h1>
            <p className="text-gray-500 mt-1">Керування запитами гостей та базою знань ШІ</p>
          </div>
          <Button variant="outline" onClick={() => { localStorage.removeItem("concierge_admin_pwd"); setIsAuthenticated(false); }}>Вийти</Button>
        </div>

        <Tabs defaultValue="requests" className="w-full">
          <TabsList className="grid w-[400px] grid-cols-2">
            <TabsTrigger value="requests">Запити гостей</TabsTrigger>
            <TabsTrigger value="knowledge">База знань</TabsTrigger>
          </TabsList>
          
          <TabsContent value="requests" className="mt-6 space-y-4">
            {requests.length === 0 ? (
              <div className="text-center py-12 text-gray-500">Немає запитів</div>
            ) : (
              requests.map(req => (
                <Card key={req.id} className={`overflow-hidden ${req.status === 'completed' ? 'opacity-60' : ''}`}>
                  <CardContent className="p-0 flex flex-col md:flex-row">
                    <div className="p-6 md:w-1/3 bg-gray-100/50 border-r border-gray-100">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-white">
                          {TYPE_EMOJIS[req.type] || "ℹ️"} {TYPE_LABELS[req.type] || req.type}
                        </Badge>
                        <Badge variant={req.status === 'completed' ? 'secondary' : 'default'} className={req.status === 'pending' ? 'bg-amber-100 text-amber-800 hover:bg-amber-100' : ''}>
                          {req.status === 'completed' ? 'Виконано' : 'Очікує'}
                        </Badge>
                      </div>
                      <p className="font-medium text-lg">{req.unitName} — {req.guestName}</p>
                      <p className="text-xs text-gray-500 mt-1">{new Date(req.created_at).toLocaleString('uk-UA')}</p>
                    </div>
                    <div className="p-6 md:w-2/3 flex flex-col justify-between space-y-4">
                      <p className="text-gray-800 text-lg">«{req.request_text}»</p>
                      
                      {req.status === 'completed' ? (
                        <div className="bg-gray-50 rounded-md p-3 text-sm border border-gray-100">
                          <span className="font-medium text-gray-700">Ваша відповідь:</span> {req.admin_reply}
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Input 
                            placeholder="Написати відповідь гостю..." 
                            value={replyText[req.id] || ""}
                            onChange={e => setReplyText({ ...replyText, [req.id]: e.target.value })}
                          />
                          <Button onClick={() => handleReply(req.id)} className="shrink-0">Відповісти</Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
          
          <TabsContent value="knowledge" className="mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Знання ШІ-консьєржа</h2>
              <Button>Додати запис</Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {knowledge.map(k => (
                <Card key={k.id}>
                  <CardContent className="p-5">
                    <Badge variant="outline" className="mb-3">{k.category}</Badge>
                    <h3 className="font-semibold text-lg mb-2">{k.title}</h3>
                    <p className="text-gray-600 text-sm line-clamp-4">{k.content}</p>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button variant="ghost" size="sm">Редагувати</Button>
                      <Button variant="ghost" size="sm" className="text-red-500">Видалити</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}