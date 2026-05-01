import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Setup() {
  const [, setLocation] = useLocation();
  const [orgSlug, setOrgSlug] = useState(localStorage.getItem("concierge_org_slug") || "");
  const [unitId, setUnitId] = useState(localStorage.getItem("concierge_unit_id") || "");

  const handleSave = () => {
    if (!orgSlug || !unitId) return;
    
    localStorage.setItem("concierge_org_slug", orgSlug);
    localStorage.setItem("concierge_unit_id", unitId);
    
    setLocation("/");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0A0D14] text-[#E8E1D5] p-4">
      <Card className="w-full max-w-md bg-[#1A1F2E] border-[#313B52] text-[#E8E1D5]">
        <CardHeader>
          <CardTitle className="text-2xl font-serif text-[#CFA162]">Room Concierge Setup</CardTitle>
          <CardDescription className="text-gray-400">Configure this terminal for a specific room.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="orgSlug" className="text-gray-300">Organization Slug</Label>
            <Input 
              id="orgSlug" 
              value={orgSlug} 
              onChange={e => setOrgSlug(e.target.value)} 
              placeholder="e.g. grand-hotel"
              className="bg-[#0A0D14] border-[#313B52] focus-visible:ring-[#CFA162]"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="unitId" className="text-gray-300">Unit ID</Label>
            <Input 
              id="unitId" 
              type="number"
              value={unitId} 
              onChange={e => setUnitId(e.target.value)} 
              placeholder="e.g. 101"
              className="bg-[#0A0D14] border-[#313B52] focus-visible:ring-[#CFA162]"
            />
          </div>
          
          <Button 
            onClick={handleSave} 
            disabled={!orgSlug || !unitId}
            className="w-full bg-[#CFA162] hover:bg-[#b08852] text-black font-bold"
          >
            Save & Launch Terminal
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}