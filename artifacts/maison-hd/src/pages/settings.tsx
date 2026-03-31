import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetMe } from "@workspace/api-client-react";

export default function SettingsPage() {
  const { data: user } = useGetMe();

  return (
    <AppLayout>
      <div className="p-8 max-w-5xl mx-auto h-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Налаштування</h1>
          <p className="text-muted-foreground mt-1">Керування обліковим записом та параметрами системи.</p>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="mb-6 bg-muted/50 p-1">
            <TabsTrigger value="profile">Профіль</TabsTrigger>
            <TabsTrigger value="hotel">Дані готелю</TabsTrigger>
            <TabsTrigger value="billing">Оплата</TabsTrigger>
          </TabsList>
          
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Особисті дані</CardTitle>
                <CardDescription>Оновіть свою контактну інформацію та пароль.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Повне ім'я</Label>
                    <Input id="name" defaultValue={user?.name || ""} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" defaultValue={user?.email || ""} disabled />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Роль у системі</Label>
                  <Input id="role" defaultValue={user?.role || "Адміністратор"} disabled />
                </div>
                <Button>Зберегти зміни</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hotel">
            <Card>
              <CardHeader>
                <CardTitle>Налаштування об'єкту</CardTitle>
                <CardDescription>Основна інформація про готель, що відображається у системі.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="hotelName">Назва об'єкту</Label>
                  <Input id="hotelName" defaultValue="Boutique Hotel Kyiv" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Основна валюта</Label>
                  <Input id="currency" defaultValue="UAH (Українська гривня)" disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Часовий пояс</Label>
                  <Input id="timezone" defaultValue="Europe/Kiev" disabled />
                </div>
                <Button>Зберегти налаштування</Button>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="billing">
            <Card>
              <CardHeader>
                <CardTitle>Підписка</CardTitle>
                <CardDescription>Керування підпискою Maison HD.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-primary">Pro План</h4>
                    <p className="text-sm text-muted-foreground mt-1">Активний до 12 Грудня 2024</p>
                  </div>
                  <Button variant="outline">Управління підпискою</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
