import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";

import Login from "@/pages/login";
import Tables from "@/pages/tables";
import Order from "@/pages/order";
import MenuPage from "@/pages/menu";
import NewOrder from "@/pages/new-order";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000 } },
});

function ProtectedRoute({ component: C }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-900" />;
  if (!user) return <Redirect to="/login" />;
  return <C />;
}

function PublicRoute({ component: C }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center" />;
  if (user) return <Redirect to="/tables" />;
  return <C />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login"><PublicRoute component={Login} /></Route>
      <Route path="/tables"><ProtectedRoute component={Tables} /></Route>
      <Route path="/order/:orderId"><ProtectedRoute component={Order} /></Route>
      <Route path="/menu/:orderId"><ProtectedRoute component={MenuPage} /></Route>
      <Route path="/new-order/:tableId"><ProtectedRoute component={NewOrder} /></Route>
      <Route path="/"><Redirect to="/tables" /></Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
