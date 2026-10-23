import { InventoryColumn } from "@/components/inventory/inventory-column";
import { useWare } from "@/store";
import { AgeingList } from "./ageing-list";
import { DealsList } from "./deals-list";
import { ReceiveList } from "./receive-list";
import { ReplenishList } from "./replenish-list";

/** Left column: the inventory by default, or the panel a command opened. */
export function StageColumn({ wide, className }: { wide: boolean; className?: string }) {
  const stage = useWare((s) => s.stage);
  switch (stage) {
    case "receive":
      return <ReceiveList className={className} />;
    case "ageing":
      return <AgeingList className={className} />;
    case "deals":
    case "delivery":
    case "approve":
    case "collect":
      return <DealsList view={stage} className={className} />;
    case "replenish":
      return <ReplenishList className={className} />;
    default:
      return <InventoryColumn wide={wide} className={className} />;
  }
}
