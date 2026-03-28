/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Ian Lucas. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const CUSTOM_SKIN_CONTAINER_ID_PREFIX = 900000000;
const CUSTOM_SKIN_PAINT_INDEX_FACTOR = 100000;

export function encodeCustomSkinContainerId(
  weaponDef: number,
  paintIndex: number
) {
  return (
    CUSTOM_SKIN_CONTAINER_ID_PREFIX +
    weaponDef * CUSTOM_SKIN_PAINT_INDEX_FACTOR +
    paintIndex
  );
}

export function decodeCustomSkinContainerId(containerId?: number) {
  if (
    containerId === undefined ||
    containerId < CUSTOM_SKIN_CONTAINER_ID_PREFIX
  ) {
    return undefined;
  }

  const encoded = containerId - CUSTOM_SKIN_CONTAINER_ID_PREFIX;
  const weaponDef = Math.floor(encoded / CUSTOM_SKIN_PAINT_INDEX_FACTOR);
  const paintIndex = encoded % CUSTOM_SKIN_PAINT_INDEX_FACTOR;

  if (weaponDef < 0 || paintIndex < 0) {
    return undefined;
  }

  return {
    paintIndex,
    weaponDef
  };
}
