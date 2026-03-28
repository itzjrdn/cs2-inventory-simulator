/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Ian Lucas. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CS2BaseInventoryItem, CS2Economy, CS2ItemType } from "@ianlucas/cs2-lib";
import { useEffect, useMemo, useState } from "react";
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
  category: CraftCategory;
  def: number;
  group: string;
  id: number;
  label: string;
};

type CraftCategory = "gun" | "knife";

function isWeaponOrKnife(item: { type: string }) {
  return item.type === CS2ItemType.Weapon || item.type === CS2ItemType.Melee;
}

function getCraftCategory(item: { type: string }): CraftCategory {
  return item.type === CS2ItemType.Melee ? "knife" : "gun";
}

function getWeaponGroup(item: {
  type: string;
  isMachinegun: () => boolean;
  isPistol: () => boolean;
  isRifle: () => boolean;
  isSMG: () => boolean;
  isSniperRifle: () => boolean;
}) {
  if (item.type === CS2ItemType.Melee) {
    return "Knives";
  }
  if (item.isPistol()) {
    return "Pistols";
  }
  if (item.isSMG()) {
    return "SMGs";
  }
  if (item.isRifle()) {
    return "Rifles";
  }
  if (item.isSniperRifle()) {
    return "Sniper Rifles";
  }
  if (item.isMachinegun()) {
    return "Machineguns";
  }
  return "Other Guns";
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
        category: getCraftCategory(item),
        def,
        group: getWeaponGroup(item),
        id: item.id,
        score,
        label
      });
    }
  }

  return Array.from(options.values())
    .map(({ score, ...option }) => option)
    .sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      if (a.group !== b.group) {
        return a.group.localeCompare(b.group);
      }
      return a.label.localeCompare(b.label);
    });
}

function resolveItemIdFromDefAndPaintIndex(
  weaponDef: number,
  paintIndex: number,
  weaponOptions: WeaponOption[],
  attributes: {
    seed: number;
    statTrak: "on" | undefined;
    wear: number;
  }
) {
  const exactMatches = CS2Economy.itemsAsArray.filter(
    (item) =>
      (item.type === CS2ItemType.Weapon || item.type === CS2ItemType.Melee) &&
      item.def === weaponDef &&
      item.index === paintIndex &&
      !item.isStub()
  );

  // For non-existing paint indexes, choose the best non-stock-like skin variant.
  const fallbackCandidates = CS2Economy.itemsAsArray
    .filter(
      (item) =>
        isWeaponOrKnife(item) &&
        item.def === weaponDef &&
        item.index !== undefined &&
        !item.isStub()
    )
    .sort((a, b) => scoreFallbackCandidate(b) - scoreFallbackCandidate(a));

  const candidates = [...exactMatches, ...fallbackCandidates];

  const compatibleCandidate = candidates.find((candidate) => {
    if (attributes.statTrak === "on" && !CS2Economy.safeValidateStatTrak(0, candidate)) {
      return false;
    }
    if (attributes.statTrak === undefined && candidate.statTrakOnly === true) {
      return false;
    }
    if (candidate.hasWear() && !CS2Economy.safeValidateWear(attributes.wear, candidate)) {
      return false;
    }
    if (candidate.hasSeed() && !CS2Economy.safeValidateSeed(attributes.seed, candidate)) {
      return false;
    }
    return true;
  });

  if (compatibleCandidate !== undefined) {
    return compatibleCandidate.id;
  }

  const fallbackCandidate = candidates[0];

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
    weaponOptions,
    {
      seed,
      statTrak,
      wear
    }
  );

  if (id === undefined) {
    return data({
      error: "Failed to resolve a weapon for the selected values."
    });
  }

  const economyItem = CS2Economy.getById(id);
  const wearMin = economyItem.getMinimumWear();
  const wearMax = economyItem.getMaximumWear();
  const seedMin = economyItem.getMinimumSeed();
  const seedMax = economyItem.getMaximumSeed();

  const item: CS2BaseInventoryItem = {
    containerId: encodeCustomSkinContainerId(weaponDef, paintIndex),
    id,
    nameTag,
    seed:
      economyItem.hasSeed()
        ? Math.min(seedMax, Math.max(seedMin, seed))
        : undefined,
    statTrak:
      statTrak === "on" && economyItem.hasStatTrak()
        ? 0
        : economyItem.statTrakOnly === true
          ? 0
          : undefined,
    wear:
      economyItem.hasWear()
        ? Math.min(wearMax, Math.max(wearMin, wear))
        : undefined
  };

  try {
    await manipulateUserInventory({
      rawInventory,
      userId,
      manipulate(inventory) {
        if (inventory.isFull()) {
          throw new Error("Inventory is full.");
        }
        inventory.add(item);
      }
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.message.length > 0
        ? error.message
        : "validation failed";
    return data({
      error: `Failed to create this skin with the selected attributes. ${reason}`
    });
  }

  return redirect("/");
}

export default function CustomSkin() {
  const { weaponOptions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const translate = useTranslate();
  const navigation = useNavigation();
  const [category, setCategory] = useState<CraftCategory>("gun");
  const categoryOptions = useMemo(
    () => [
      { label: "Guns", value: "gun" },
      { label: "Knives", value: "knife" }
    ],
    []
  );
  const availableCategoryOptions = useMemo(
    () =>
      categoryOptions.filter((option) =>
        weaponOptions.some((weapon) => weapon.category === option.value)
      ),
    [categoryOptions, weaponOptions]
  );
  const filteredByCategory = useMemo(
    () => weaponOptions.filter((weapon) => weapon.category === category),
    [category, weaponOptions]
  );
  const groups = useMemo(
    () => [...new Set(filteredByCategory.map((weapon) => weapon.group))],
    [filteredByCategory]
  );
  const groupOptions = useMemo(
    () =>
      groups.length > 0
        ? groups.map((value) => ({ label: value, value }))
        : [{ label: "No groups available", value: "" }],
    [groups]
  );
  const [group, setGroup] = useState("");
  const filteredWeapons = useMemo(
    () => filteredByCategory.filter((weapon) => weapon.group === group),
    [filteredByCategory, group]
  );
  const weaponSelectOptions = useMemo(
    () =>
      filteredWeapons.length > 0
        ? filteredWeapons.map((weapon) => ({
            value: String(weapon.def),
            label: weapon.label
          }))
        : [{ label: "No weapons available", value: "" }],
    [filteredWeapons]
  );
  const [weaponDef, setWeaponDef] = useState("");
  const [statTrak, setStatTrak] = useState(false);

  useEffect(() => {
    if (availableCategoryOptions.length > 0) {
      const isCurrentCategoryAvailable = availableCategoryOptions.some(
        (option) => option.value === category
      );
      if (!isCurrentCategoryAvailable) {
        setCategory(availableCategoryOptions[0].value as CraftCategory);
      }
    }
  }, [availableCategoryOptions, category]);

  useEffect(() => {
    if (groups.length > 0 && !groups.includes(group)) {
      setGroup(groups[0]);
    }
    if (groups.length === 0 && group !== "") {
      setGroup("");
    }
  }, [group, groups]);

  useEffect(() => {
    if (filteredWeapons.length > 0) {
      const isCurrentWeaponAvailable = filteredWeapons.some(
        (weapon) => String(weapon.def) === weaponDef
      );
      if (!isCurrentWeaponAvailable) {
        setWeaponDef(String(filteredWeapons[0].def));
      }
      return;
    }

    if (weaponDef !== "") {
      setWeaponDef("");
    }
  }, [filteredWeapons, weaponDef]);

  return (
    <Modal className="w-135">
      <ModalHeader title="Custom Skin Builder" closeTo="/" />
      <Form method="post" className="mt-2 space-y-2 px-2">
        <SettingsLabel label="Category">
          <Select
            value={category}
            onChange={(value) => setCategory(value as CraftCategory)}
            options={availableCategoryOptions}
          >
            {(option) => option.label}
          </Select>
        </SettingsLabel>
        <SettingsLabel label="Group">
          <Select
            value={group}
            onChange={setGroup}
            options={groupOptions}
          >
            {(option) => option.label}
          </Select>
        </SettingsLabel>
        <SettingsLabel label="Weapon">
          <Select
            value={weaponDef}
            onChange={setWeaponDef}
            options={weaponSelectOptions}
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
