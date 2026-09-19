import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2, Mail, X } from "lucide-react";
import { MaisonLogo } from "@/components/MaisonLogo";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLogin, useGetMe } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.VITE_API_URL ?? "";

const loginSchema = z.object({
  email: z.string().email({ message: "Введіть дійсну адресу електронної пошти" }),
  password: z.string().min(6, { message: "Пароль має містити щонайменше 6 символів" }),
});

function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSending(true);
    try {
      const r = await fetch(`${BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (r.ok) {
        setSent(true);
      } else {
        const d = await r.json().catch(() => ({}));
        toast({ title: "Помилка", description: d.error || "Не вдалось надіслати листа", variant: "destructive" });
      }
    } catch {
      toast({ title: "Помилка", description: "Перевірте підключення до мережі", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className="flex flex-col items-center mb-5">
          <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Відновлення пароля</h2>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Введіть email вашого облікового запису — надішлемо посилання для скидання.
          </p>
        </div>
        {sent ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              ✓ Лист надіслано на <strong>{email}</strong>.<br />Перевірте вхідні або папку «Спам».
            </p>
            <Button className="w-full" onClick={onClose}>Закрити</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="forgot-email" className="text-sm">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="mt-1"
                autoFocus
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={sending || !email}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {sending ? "Надсилання..." : "Надіслати посилання"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [forgotOpen, setForgotOpen] = useState(false);

  const { data: user, isLoading: isUserLoading } = useGetMe();

  useEffect(() => {
    if (user) {
      setLocation("/dashboard");
    }
  }, [user, setLocation]);

  const loginMutation = useLogin();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate({ data: values }, {
      onSuccess: (response) => {
        localStorage.setItem("hms_token", response.token);
        toast({
          title: "Успішний вхід",
          description: "Ласкаво просимо до Maison HD",
        });
        setLocation("/dashboard");
      },
      onError: (error) => {
        toast({
          title: "Помилка входу",
          description: error.message || "Перевірте свої облікові дані та спробуйте ще раз.",
          variant: "destructive",
        });
      }
    });
  };

  if (isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {forgotOpen && <ForgotPasswordModal onClose={() => setForgotOpen(false)} />}

      <div className="min-h-screen w-full flex items-center justify-center bg-background p-4 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />

        <div className="w-full max-w-md z-10">
          <div className="flex flex-col items-center mb-8 text-center">
            <MaisonLogo size={52} textVariant="light" showText={false} className="mb-4" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Maison HD</h1>
            <p className="text-muted-foreground mt-2 font-mono text-sm uppercase tracking-widest">Property Management System</p>
          </div>

          <Card className="border-border/50 shadow-xl shadow-black/5 backdrop-blur-sm bg-card/95">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-semibold tracking-tight">Вхід до системи</CardTitle>
              <CardDescription className="text-muted-foreground">
                Введіть свої дані для доступу до панелі керування.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <Label htmlFor="email">Електронна пошта</Label>
                        <FormControl>
                          <Input
                            id="email"
                            placeholder="name@example.com"
                            type="email"
                            autoCapitalize="none"
                            autoComplete="email"
                            autoCorrect="off"
                            disabled={loginMutation.isPending}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password">Пароль</Label>
                          <button
                            type="button"
                            onClick={() => setForgotOpen(true)}
                            className="text-sm text-muted-foreground hover:text-primary transition-colors"
                          >
                            Забули пароль?
                          </button>
                        </div>
                        <FormControl>
                          <Input
                            id="password"
                            type="password"
                            disabled={loginMutation.isPending}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    className="w-full mt-6"
                    type="submit"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Увійти
                  </Button>
                </form>
              </Form>
            </CardContent>
            <CardFooter className="flex flex-col items-center gap-1.5 border-t p-4">
              <p className="text-sm text-muted-foreground">Захищено для сертифікованих партнерів</p>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground/70">
                <a href="/legal/offer" className="hover:text-blue-600 hover:underline transition-colors">Оферта</a>
                <span>·</span>
                <a href="/legal/privacy" className="hover:text-blue-600 hover:underline transition-colors">Privacy Policy</a>
                <span>·</span>
                <a href="/legal/terms" className="hover:text-blue-600 hover:underline transition-colors">Terms of Service</a>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </>
  );
}
