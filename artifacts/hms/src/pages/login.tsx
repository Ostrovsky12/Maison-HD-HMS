import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button, Input, Label, Card, CardContent } from "@/components/ui/shared";
import { Hotel } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Помилка входу. Перевірте дані.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:flex-none lg:px-20 xl:px-24 z-10">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div className="flex items-center space-x-3 mb-8">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Hotel className="w-6 h-6 text-primary-foreground" />
            </div>
            <h2 className="text-3xl font-display font-bold text-foreground tracking-tight">Dogoda</h2>
          </div>

          <Card className="border-border/50 shadow-2xl bg-card/80 backdrop-blur-xl">
            <CardContent className="pt-8">
              <h1 className="text-2xl font-bold tracking-tight mb-2">Вітаємо!</h1>
              <p className="text-sm text-muted-foreground mb-8">Увійдіть до системи управління готелем.</p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <Label htmlFor="email">Електронна пошта</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    placeholder="admin@dogoda.com" 
                    required 
                    className="bg-background/50"
                  />
                </div>

                <div>
                  <Label htmlFor="password">Пароль</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    placeholder="••••••••" 
                    required 
                    className="bg-background/50"
                  />
                </div>

                {error && <div className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-lg">{error}</div>}

                <Button type="submit" className="w-full text-base h-11" disabled={loading}>
                  {loading ? "Вхід..." : "Увійти до системи"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <div className="hidden lg:block relative w-0 flex-1">
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src={`${import.meta.env.BASE_URL}images/login-bg.png`}
          alt="Готель Dogoda"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/50 to-transparent" />
      </div>
    </div>
  );
}
