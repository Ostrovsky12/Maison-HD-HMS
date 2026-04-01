import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetMe } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import BookingsPage from "@/pages/bookings";
import UnitsPage from "@/pages/units";
import GuestsPage from "@/pages/guests";
import HousekeepingPage from "@/pages/housekeeping";
import ReportsPage from "@/pages/reports";
import SettingsPage from "@/pages/settings";
import ChessPage from "@/pages/chess";
import InvoicesPage from "@/pages/invoices";
import AnalyticsPage from "@/pages/analytics";
import IntegrationsPage from "@/pages/integrations";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: user, isLoading, error } = useGetMe();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !user) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/dashboard"><ProtectedRoute component={DashboardPage} /></Route>
      <Route path="/bookings"><ProtectedRoute component={BookingsPage} /></Route>
      <Route path="/units"><ProtectedRoute component={UnitsPage} /></Route>
      <Route path="/guests"><ProtectedRoute component={GuestsPage} /></Route>
      <Route path="/chess"><ProtectedRoute component={ChessPage} /></Route>
      <Route path="/housekeeping"><ProtectedRoute component={HousekeepingPage} /></Route>
      <Route path="/invoices"><ProtectedRoute component={InvoicesPage} /></Route>
      <Route path="/reports"><ProtectedRoute component={ReportsPage} /></Route>
      <Route path="/analytics"><ProtectedRoute component={AnalyticsPage} /></Route>
      <Route path="/integrations"><ProtectedRoute component={IntegrationsPage} /></Route>
      <Route path="/settings"><ProtectedRoute component={SettingsPage} /></Route>
      
      {/* Default redirect based on auth */}
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
