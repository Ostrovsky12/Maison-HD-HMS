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
import FbCashier from "@/pages/fb-cashier";
import FbReportSales from "@/pages/fb-report-sales";
import FbReportOrders from "@/pages/fb-report-orders";
import FbReportProducts from "@/pages/fb-report-products";
import FbReportAbc from "@/pages/fb-report-abc";
import FbReportAi from "@/pages/fb-report-ai";
import FbShifts from "@/pages/fb-shifts";
import FbWriteoffs from "@/pages/fb-writeoffs";
import FbClients from "@/pages/fb-clients";
import FbClientGroups from "@/pages/fb-client-groups";
import FbLoyalty from "@/pages/fb-loyalty";
import FbExceptions from "@/pages/fb-exceptions";
import FbPromotions from "@/pages/fb-promotions";
import FbInventorySessions from "@/pages/fb-inventory-sessions";
import FbTransfers from "@/pages/fb-transfers";
import FbMovementReport from "@/pages/fb-movement-report";
import FbWarehousesList from "@/pages/fb-warehouses-list";
import FbPackaging from "@/pages/fb-packaging";
import FbStaffAccess from "@/pages/fb-staff-access";
import FbPositions from "@/pages/fb-positions";
import FbRegisters from "@/pages/fb-registers";
import FbSessions from "@/pages/fb-sessions";
import FbIntegrations from "@/pages/fb-integrations";
import FbApps from "@/pages/fb-apps";
import FbStopList from "@/pages/fb-stop-list";
import FbPrintCards from "@/pages/fb-print-cards";
import FbPostie from "@/pages/fb-postie";
import FbDeliveryBot from "@/pages/fb-delivery-bot";
import FbConfigGeneral from "@/pages/fb-config-general";
import FbConfigSubscription from "@/pages/fb-config-subscription";
import FbConfigOrders from "@/pages/fb-config-orders";
import FbConfigDelivery from "@/pages/fb-config-delivery";
import FbConfigTables from "@/pages/fb-config-tables";
import FbConfigSecurity from "@/pages/fb-config-security";
import FbConfigReceipt from "@/pages/fb-config-receipt";
import FbConfigTaxes from "@/pages/fb-config-taxes";

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
      <Route path="/fb/staff-access"><ProtectedRoute component={FbStaffAccess} /></Route>
      <Route path="/fb/positions"><ProtectedRoute component={FbPositions} /></Route>
      <Route path="/fb/registers"><ProtectedRoute component={FbRegisters} /></Route>
      <Route path="/fb/sessions"><ProtectedRoute component={FbSessions} /></Route>
      <Route path="/fb/integrations"><ProtectedRoute component={FbIntegrations} /></Route>
      <Route path="/fb/cashier"><ProtectedRoute component={FbCashier} /></Route>
      <Route path="/fb/report/ai"><ProtectedRoute component={FbReportAi} /></Route>
      <Route path="/fb/report/sales"><ProtectedRoute component={FbReportSales} /></Route>
      <Route path="/fb/report/orders"><ProtectedRoute component={FbReportOrders} /></Route>
      <Route path="/fb/report/products"><ProtectedRoute component={FbReportProducts} /></Route>
      <Route path="/fb/report/abc"><ProtectedRoute component={FbReportAbc} /></Route>
      <Route path="/fb/shifts"><ProtectedRoute component={FbShifts} /></Route>
      <Route path="/fb/writeoffs"><ProtectedRoute component={FbWriteoffs} /></Route>
      <Route path="/fb/inventory"><ProtectedRoute component={FbInventorySessions} /></Route>
      <Route path="/fb/transfers"><ProtectedRoute component={FbTransfers} /></Route>
      <Route path="/fb/movement-report"><ProtectedRoute component={FbMovementReport} /></Route>
      <Route path="/fb/clients"><ProtectedRoute component={FbClients} /></Route>
      <Route path="/fb/client-groups"><ProtectedRoute component={FbClientGroups} /></Route>
      <Route path="/fb/loyalty"><ProtectedRoute component={FbLoyalty} /></Route>
      <Route path="/fb/exceptions"><ProtectedRoute component={FbExceptions} /></Route>
      <Route path="/fb/promotions"><ProtectedRoute component={FbPromotions} /></Route>
      <Route path="/fb/warehouses"><ProtectedRoute component={FbWarehousesList} /></Route>
      <Route path="/fb/packaging"><ProtectedRoute component={FbPackaging} /></Route>
      <Route path="/fb/receipts"><ProtectedRoute component={FbWarehouse} /></Route>
      <Route path="/fb/suppliers"><ProtectedRoute component={FbWarehouse} /></Route>
      <Route path="/fb/apps"><ProtectedRoute component={FbApps} /></Route>
      <Route path="/fb/stop-list"><ProtectedRoute component={FbStopList} /></Route>
      <Route path="/fb/print-cards"><ProtectedRoute component={FbPrintCards} /></Route>
      <Route path="/fb/postie"><ProtectedRoute component={FbPostie} /></Route>
      <Route path="/fb/delivery-bot"><ProtectedRoute component={FbDeliveryBot} /></Route>
      <Route path="/fb/config/general"><ProtectedRoute component={FbConfigGeneral} /></Route>
      <Route path="/fb/config/subscription"><ProtectedRoute component={FbConfigSubscription} /></Route>
      <Route path="/fb/config/orders"><ProtectedRoute component={FbConfigOrders} /></Route>
      <Route path="/fb/config/delivery"><ProtectedRoute component={FbConfigDelivery} /></Route>
      <Route path="/fb/config/tables"><ProtectedRoute component={FbConfigTables} /></Route>
      <Route path="/fb/config/security"><ProtectedRoute component={FbConfigSecurity} /></Route>
      <Route path="/fb/config/receipt"><ProtectedRoute component={FbConfigReceipt} /></Route>
      <Route path="/fb/config/taxes"><ProtectedRoute component={FbConfigTaxes} /></Route>
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
