import { useState } from "react";
import { ServioCategoryCard } from "./_OriginalCard";
import { previewRooms } from "./_data";
import "./_group.css";
export default function CurrentServio() {
  const [selected, setSelected] = useState<number|null>(null);
  return <div className="dogoda-root dg-font-brand dogoda-cards-preview p-5">
    <p className="preview-note">Чинний компонент Servio · демонстраційні дані · фото з вашого скриншота</p>
    <div className="mx-auto max-w-4xl space-y-5">
      {previewRooms.map((r,i)=><ServioCategoryCard key={r.key} categoryKey={r.key} name={r.name} capacity={r.capacity}
        photos={r.photo?[r.photo]:[]} description={r.description}
        details={{occupancyText:`до ${r.capacity} гостей`,areaText:r.area,bedsText:r.beds,sofaText:r.sofa,amenities:r.amenities,tariffTitle:"Неповоротний"}}
        rates={[{id:i+1,rateName:"NR Site",total:r.total,charges:[]}]} selectedId={selected} disabled={false} accent="#DF7D3C" supplementary="" onSelect={setSelected}/>)}
    </div>
  </div>;
}
