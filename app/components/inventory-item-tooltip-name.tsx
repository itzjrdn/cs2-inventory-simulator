/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Ian Lucas. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CS2InventoryItem } from "@ianlucas/cs2-lib";
import { useNameItemString } from "~/components/hooks/use-name-item";
import { ItemImage } from "./item-image";

export function InventoryItemTooltipName({
  item,
  collectionNameOverride
}: {
  item: CS2InventoryItem;
  collectionNameOverride?: string;
}) {
  const nameItemString = useNameItemString();
  const collectionName = collectionNameOverride ?? item.collectionName;

  if (collectionNameOverride !== undefined) {
    return (
      <div>
        <div className="font-bold">{nameItemString(item)}</div>
        <div>{collectionNameOverride}</div>
      </div>
    );
  }

  if (collectionName === undefined) {
    return <div className="font-bold">{nameItemString(item)}</div>;
  }

  return (
    <div className="flex items-center gap-1">
      <ItemImage className="h-10" item={item} type="collection" />
      <div className="flex-1">
        <div className="font-bold">{nameItemString(item)}</div>
        <div>{collectionName}</div>
      </div>
    </div>
  );
}
