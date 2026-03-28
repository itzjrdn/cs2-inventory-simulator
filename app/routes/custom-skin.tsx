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
import type { Route } from "./+types/custom-skin";

type WeaponOption = {
  def: number;
  id: number;
  label: string;
};

const customSkinShape = z.object({
  weaponDef: z.coerce.number().int().nonnegative(),
  paintIndex: z.coerce.number().int().min(0),
  wear: z.coerce.number().min(0).max(1),
  seed: z.coerce.number().int().min(0).max(1000),
  statTrak: z.union([z.literal("on"), z.undefined()]),
  nameTag: z
    .string()
    .max(20)
    .optional()
    .transform((nameTag) => CS2Economy.trimNametag(nameTag))
    .refine((nameTag) => CS2Economy.safeValidateNametag(nameTag))
});

function getWeaponOptions() {
  return CS2Economy.itemsAsArray
    .filter(
      (item) =>
        (item.type === CS2ItemType.Weapon || item.type === CS2ItemType.Melee) &&
        item.base === true &&
        item.def !== undefined
    )
    .map(
      (item) =>
        ({
          def: item.def as number,
          id: item.id,
          label: item.name
        }) satisfies WeaponOption
    )
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
      item.index === paintIndex
  );

  if (exactMatch !== undefined) {
    return exactMatch.id;
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
    return data(
      {
        error: "Invalid custom skin values."
      },
      {
        status: 400
      }
    );
  }

  const weaponOptions = getWeaponOptions();
  const { weaponDef, paintIndex, seed, wear, statTrak, nameTag } = result.data;

  const id = resolveItemIdFromDefAndPaintIndex(
    weaponDef,
    paintIndex,
    weaponOptions
  );

  if (id === undefined) {
    return data(
      {
        error: "Failed to resolve a weapon for the selected values."
      },
      {
        status: 400
      }
    );
  }

  const item: CS2BaseInventoryItem = {
    id,
    nameTag,
    seed,
    statTrak: statTrak === "on" ? 0 : undefined,
    wear
  };

  await manipulateUserInventory({
    rawInventory,
    userId,
    manipulate(inventory) {
      inventory.add(item);
    }
  });

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
            min={0}
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
