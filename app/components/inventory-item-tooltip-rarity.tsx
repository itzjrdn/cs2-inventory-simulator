/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Ian Lucas. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CS2EconomyItem } from "@ianlucas/cs2-lib";
import { RarityLabel, getRarityItemName } from "~/utils/economy";
import { useTranslate } from "./app-context";
import { InventoryItemTooltipInfo } from "./inventory-item-tooltip-info";

export function InventoryItemTooltipRarity({
  item,
  customLabel
}: {
  item: CS2EconomyItem;
  customLabel?: string;
}) {
  const translate = useTranslate();

  if (customLabel !== undefined) {
    return (
      <InventoryItemTooltipInfo
        style={{ color: "#67e8f9" }}
        label={translate("InventoryItemRarity")}
      >
        {customLabel}
      </InventoryItemTooltipInfo>
    );
  }

  const rarityType = item.isPaintable() || item.isC4() ? "Weapon" : "";
  const rarityLabel = RarityLabel[item.rarity];
  const rarityKey = `Item${rarityType}Rarity${rarityLabel}` as const;
  const nameKey = `ItemRarityName${getRarityItemName(item)}` as const;

  return (
    <InventoryItemTooltipInfo
      style={{ color: item.rarity }}
      label={translate("InventoryItemRarity")}
    >
      {translate("ItemRarityFormat", translate(rarityKey), translate(nameKey))}
    </InventoryItemTooltipInfo>
  );
}
