/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Ian Lucas. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CS2BaseInventoryItem, CS2Economy, CS2ItemType } from "@ianlucas/cs2-lib";
import { useState } from "react";
import {
  data,
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation
} from "react-router";
import { z } from "zod";
import { requireUser } from "~/auth.server";
import { useTranslate } from "~/components/app-context";
import { EditorInput } from "~/components/editor-input";
import { EditorToggle } from "~/components/editor-toggle";
import { Modal, ModalHeader } from "~/components/modal";
import { ModalButton } from "~/components/modal-button";
import { Select } from "~/components/select";
import { SettingsLabel } from "~/components/settings-label";
import { middleware } from "~/middleware.server";
import { manipulateUserInventory } from "~/models/user.server";
import { getMetaTitle } from "~/root-meta";
import { encodeCustomSkinContainerId } from "~/utils/custom-skin";
import type { Route } from "./+types/custom-skin";

type WeaponOption = {
  def: number;
  id: number;
  label: string;
};

function isWeaponOrKnife(item: { type: string }) {
  return item.type === CS2ItemType.Weapon || item.type === CS2ItemType.Melee;
}

function scoreFallbackCandidate(item: {
  base: boolean | undefined;
  index: number | undefined;
  hasWear: () => boolean;
  isPaintable: () => boolean;
  statTrakOnly: boolean | undefined;
}) {
  // Prefer real skinned variants, then paintable/wearable items, and avoid base stock.
  return (
    (item.index !== undefined ? 8 : 0) +
    (item.isPaintable() ? 4 : 0) +
    (item.hasWear() ? 2 : 0) +
    (item.base !== true ? 1 : 0) +
    (item.statTrakOnly === true ? -2 : 0)
  );
}

const customSkinShape = z.object({
  weaponDef: z.coerce.number().int().nonnegative(),
  paintIndex: z.coerce.number().int().min(0),
  wear: z.coerce.number().min(0).max(1),
  seed: z.coerce.number().int().min(1).max(1000),
  statTrak: z.union([z.literal("on"), z.undefined()]),
  nameTag: z
    .string()
    .max(20)
    .optional()
    .transform((nameTag) => CS2Economy.trimNametag(nameTag))
    .refine((nameTag) => CS2Economy.safeValidateNametag(nameTag))
});

function getWeaponOptions() {
  const options = new Map<number, WeaponOption & { score: number }>();

  for (const item of CS2Economy.itemsAsArray) {
    if (!isWeaponOrKnife(item) || item.def === undefined || item.isStub()) {
      continue;
    }

    const def = item.def;
    const current = options.get(def);
    const label = item.name.split(" | ")[0] ?? item.name;
    const score = scoreFallbackCandidate(item);

    if (current === undefined || score > current.score) {
      options.set(def, {
        def,
        id: item.id,
        score,
        label
      });
    }
  }

  return Array.from(options.values())
    .map(({ score, ...option }) => option)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function resolveItemIdFromDefAndPaintIndex(
  weaponDef: number,
  paintIndex: number,
  weaponOptions: WeaponOption[]
) {
  const exactMatch = CS2Economy.itemsAsArray.find(
    (item) =>
      (item.type === CS2ItemType.Weapon || item.type === CS2ItemType.Melee) &&
      item.def === weaponDef &&
      item.index === paintIndex &&
      !item.isStub()
  );

  if (exactMatch !== undefined) {
    return exactMatch.id;
  }

  // For non-existing paint indexes, choose the best non-stock-like skin variant.
  const fallbackCandidate = CS2Economy.itemsAsArray
    .filter(
      (item) =>
        isWeaponOrKnife(item) &&
        item.def === weaponDef &&
        item.index !== undefined &&
        !item.isStub()
    )
    .sort((a, b) => scoreFallbackCandidate(b) - scoreFallbackCandidate(a))[0];

  if (fallbackCandidate !== undefined) {
    return fallbackCandidate.id;
  }

  const fallbackWeapon = weaponOptions.find((weapon) => weapon.def === weaponDef);
  return fallbackWeapon?.id;
}

export const meta = getMetaTitle();

export async function loader({ request }: Route.LoaderArgs) {
  await middleware(request);
  await requireUser(request);
  return data({
    weaponOptions: getWeaponOptions()
  });
}

export async function action({ request }: Route.ActionArgs) {
  await middleware(request);
  const { id: userId, inventory: rawInventory } = await requireUser(request);

  const formData = Object.fromEntries(await request.formData());
  const result = customSkinShape.safeParse(formData);
  if (!result.success) {
    return data({
      error: "Invalid custom skin values."
    });
  }

  const weaponOptions = getWeaponOptions();
  const { weaponDef, paintIndex, seed, wear, statTrak, nameTag } = result.data;

  const id = resolveItemIdFromDefAndPaintIndex(
    weaponDef,
    paintIndex,
    weaponOptions
  );

  if (id === undefined) {
    return data({
      error: "Failed to resolve a weapon for the selected values."
    });
  }

  const economyItem = CS2Economy.getById(id);

  const item: CS2BaseInventoryItem = {
    containerId: encodeCustomSkinContainerId(weaponDef, paintIndex),
    id,
    nameTag,
    seed: economyItem.hasSeed() ? seed : undefined,
    statTrak:
      statTrak === "on" && economyItem.hasStatTrak()
        ? 0
        : economyItem.statTrakOnly === true
          ? 0
          : undefined,
    wear: economyItem.hasWear() ? wear : undefined
  };

  try {
    await manipulateUserInventory({
      rawInventory,
      userId,
      manipulate(inventory) {
        inventory.add(item);
      }
    });
  } catch {
    return data({
      error: "Failed to create this skin with the selected attributes."
    });
  }

  return redirect("/");
}

export default function CustomSkin() {
  const { weaponOptions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const translate = useTranslate();
  const navigation = useNavigation();
  const [weaponDef, setWeaponDef] = useState(String(weaponOptions[0]?.def ?? ""));
  const [statTrak, setStatTrak] = useState(false);

  return (
    <Modal className="w-135">
      <ModalHeader title="Custom Skin Builder" closeTo="/" />
      <Form method="post" className="mt-2 space-y-2 px-2">
        <SettingsLabel label="Weapon">
          <Select
            value={weaponDef}
            onChange={setWeaponDef}
            options={weaponOptions.map((weapon) => ({
              value: String(weapon.def),
              label: weapon.label
            }))}
          >
            {(option) => option.label}
          </Select>
          <input type="hidden" name="weaponDef" value={weaponDef} />
        </SettingsLabel>
        <SettingsLabel label="Paint Index">
          <EditorInput
            className="w-30 min-w-30"
            min={0}
            max={99999}
            name="paintIndex"
            step="1"
            required
            type="number"
            defaultValue="0"
          />
        </SettingsLabel>
        <SettingsLabel label="Float / Paint Wear">
          <EditorInput
            className="w-30 min-w-30"
            max={1}
            min={0}
            name="wear"
            step="0.000001"
            required
            type="number"
            defaultValue="0"
          />
        </SettingsLabel>
        <SettingsLabel label="Pattern / Paint Seed">
          <EditorInput
            className="w-30 min-w-30"
            min={1}
            max={1000}
            name="seed"
            step="1"
            required
            type="number"
            defaultValue="1"
          />
        </SettingsLabel>
        <SettingsLabel label="StatTrak">
          <EditorToggle
            checked={statTrak}
            name="statTrak"
            onChange={() => setStatTrak((value) => !value)}
          />
        </SettingsLabel>
        <SettingsLabel label="Name Tag (optional)">
          <EditorInput
            className="w-63.25 min-w-63.25"
            maxLength={20}
            name="nameTag"
            placeholder="My custom build"
            type="text"
          />
        </SettingsLabel>
        {actionData?.error !== undefined && (
          <div className="rounded-sm bg-red-900/40 px-3 py-2 text-sm text-red-200">
            {actionData.error}
          </div>
        )}
        <div className="my-6 flex justify-center gap-2 px-4">
          <ModalButton
            type="submit"
            variant="primary"
            disabled={navigation.state === "submitting"}
          >
            {navigation.state === "submitting"
              ? "Creating..."
              : translate("CraftConfirmHeader")}
          </ModalButton>
        </div>
      </Form>
    </Modal>
  );
}
