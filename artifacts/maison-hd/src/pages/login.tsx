import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Building, Loader2 } from "lucide-react";
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

const loginSchema = z.object({
  email: z.string().email({ message: "Введіть дійсну адресу електронної пошти" }),
  password: z.string().min(6, { message: "Пароль має містити щонайменше 6 символів" }),
});

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
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
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Decorative abstract shapes */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="bg-primary text-primary-foreground p-3 rounded-xl shadow-lg mb-4">
            <Building className="w-8 h-8" />
          </div>
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
                        <a href="#" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                          Забули пароль?
                        </a>
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
          <CardFooter className="flex justify-center border-t p-4 text-sm text-muted-foreground">
            Захищено для сертифікованих партнерів
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
