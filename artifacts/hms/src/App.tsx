import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "./hooks/use-auth";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Chessboard from "@/pages/chess";
import Bookings from "@/pages/bookings";
import Housekeeping from "@/pages/housekeeping";
import Guests from "@/pages/guests";
import Units from "@/pages/units";
import ImportPage from "@/pages/import";
import LivingGuests from "@/pages/living-guests";
import FbLegalEntities from "@/pages/fb-legal-entities";
import FbSettings from "@/pages/fb-settings";
import FbPrro from "@/pages/fb-prro";
import FbMenu from "@/pages/fb-menu";
import FbWarehouse from "@/pages/fb-warehouse";
import FbImport from "@/pages/fb-import";
import FbQrCodes from "@/pages/fb-qr";
import FbAdminPin from "@/pages/fb-admin-pin";
import FbStaff from "@/pages/fb-staff";
import FbOutlets from "@/pages/fb-outlets";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Завантаження...</div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function HomeRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <Redirect to="/dashboard" />;
  return <Redirect to="/login" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/chess"><ProtectedRoute component={Chessboard} /></Route>
      <Route path="/bookings"><ProtectedRoute component={Bookings} /></Route>
      <Route path="/housekeeping"><ProtectedRoute component={Housekeeping} /></Route>
      <Route path="/guests"><ProtectedRoute component={Guests} /></Route>
      <Route path="/units"><ProtectedRoute component={Units} /></Route>
      <Route path="/import"><ProtectedRoute component={ImportPage} /></Route>
      <Route path="/living"><ProtectedRoute component={LivingGuests} /></Route>
      <Route path="/fb/legal-entities"><ProtectedRoute component={FbLegalEntities} /></Route>
      <Route path="/fb/settings"><ProtectedRoute component={FbSettings} /></Route>
      <Route path="/fb/prro"><ProtectedRoute component={FbPrro} /></Route>
      <Route path="/fb/menu"><ProtectedRoute component={FbMenu} /></Route>
      <Route path="/fb/warehouse"><ProtectedRoute component={FbWarehouse} /></Route>
      <Route path="/fb/import"><ProtectedRoute component={FbImport} /></Route>
      <Route path="/fb/qr"><ProtectedRoute component={FbQrCodes} /></Route>
      <Route path="/fb/admin-pin"><ProtectedRoute component={FbAdminPin} /></Route>
      <Route path="/fb/staff"><ProtectedRoute component={FbStaff} /></Route>
      <Route path="/fb/outlets"><ProtectedRoute component={FbOutlets} /></Route>
      <Route path="/"><HomeRedirect /></Route>
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
