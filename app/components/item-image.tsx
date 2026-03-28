/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Ian Lucas. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CS2EconomyItem, CS2InventoryItem } from "@ianlucas/cs2-lib";
import clsx from "clsx";
import { ComponentProps, useEffect, useState } from "react";
import { isServerContext } from "~/globals";
import {
  getCustomSkinDisplayName,
  isCustomSkinContainerId
} from "~/utils/custom-skin";
import { noop } from "~/utils/misc";
import { FillSpinner } from "./fill-spinner";

const cached: string[] = [];

export function ItemImage({
  className,
  item,
  lazy,
  onLoad,
  type,
  wear,
  ...props
}: Omit<ComponentProps<"img">, "onLoad"> & {
  item: CS2EconomyItem | CS2InventoryItem;
  lazy?: boolean;
  onLoad?: () => void;
  type?: "default" | "collection" | "specials";
  wear?: number;
}) {
  type ??= "default";
  const url =
    type === "default"
      ? item.getImage(wear)
      : type === "collection"
        ? item.getCollectionImage()
        : item.getSpecialsImage();

  const inventoryItem = item instanceof CS2InventoryItem ? item : undefined;
  const isCustomSkin =
    type === "default" && isCustomSkinContainerId(inventoryItem?.containerId);
  const customSkinName = isCustomSkin
    ? getCustomSkinDisplayName(inventoryItem?.containerId)
    : undefined;

  const [loaded, setLoaded] = useState(
    cached.includes(url) || url.includes("steamcommunity")
  );

  useEffect(() => {
    if (!loaded && !isCustomSkin) {
      let controller: AbortController | undefined = undefined;
      function fetchImage() {
        controller = new AbortController();
        fetch(url, { signal: controller?.signal })
          .then(() => {
            controller = undefined;
            setLoaded(true);
            if (!isServerContext) {
              cached.push(url);
            }
          })
          .catch(noop);
      }
      const idx = setTimeout(fetchImage, lazy ? 16 : 1);
      return () => {
        clearTimeout(idx);
        controller?.abort();
      };
    }
  }, [isCustomSkin, lazy, loaded]);

  useEffect(() => {
    if (loaded) {
      onLoad?.();
    }
  }, [loaded]);

  if (!loaded && !isCustomSkin) {
    return (
      <div
        {...props}
        className={clsx(
          "relative flex aspect-256/192 items-center justify-center",
          className
        )}
      >
        <FillSpinner className="opacity-50" />
      </div>
    );
  }

  if (isCustomSkin) {
    return (
      <div
        {...props}
        className={clsx(
          "relative flex aspect-256/192 items-center justify-center overflow-hidden bg-linear-to-br from-cyan-950 via-slate-900 to-cyan-900",
          className
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(103,232,249,0.25),transparent_45%),radial-gradient(circle_at_80%_75%,rgba(14,116,144,0.35),transparent_50%)]" />
        <div className="relative z-10 px-2 text-center">
          <div className="font-display text-[9px] tracking-[0.25em] text-cyan-300/90">
            CUSTOM SKIN
          </div>
          <div className="mt-1 text-[10px] font-bold text-white">
            {customSkinName?.model ?? "Custom Weapon"}
          </div>
          <div className="text-[9px] text-cyan-200/90">
            {customSkinName?.name ?? "Generated Finish"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <img
      alt={item.name}
      draggable={false}
      src={url}
      {...props}
      className={clsx("aspect-256/192", className)}
    />
  );
}
