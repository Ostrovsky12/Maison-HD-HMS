import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Terminal from "@/pages/terminal";
import Setup from "@/pages/setup";
import AdminPanel from "@/pages/admin";
import Bill from "@/pages/bill";
import Pay from "@/pages/pay";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Terminal} />
      <Route path="/setup" component={Setup} />
      <Route path="/admin-panel" component={AdminPanel} />
      <Route path="/bill/:orderId" component={Bill} />
      <Route path="/pay/:orderId" component={Pay} />
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
