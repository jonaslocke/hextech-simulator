"use client";

import { useEffect, useMemo, useState } from "react";
import { GameBoard } from "../game-board";
import { createGameBoardFixture, type GameBoardFixtureScenario, type GameBoardFixtureOptions } from "./game-board-fixtures";

const SCENARIOS: GameBoardFixtureScenario[] = ["stress", "attachments", "empty"];

export function GameBoardFixture() {
  const [scenario, setScenario] = useState<GameBoardFixtureScenario>("stress");
  const [runeCount, setRuneCount] = useState<number | undefined>();
  const [runeMode, setRuneMode] = useState<GameBoardFixtureOptions["runeMode"]>("mixed");
  const [battlefieldUnitCount, setBattlefieldUnitCount] = useState<number | undefined>();
  const [hidden, setHidden] = useState<GameBoardFixtureOptions["hidden"]>();
  const [trashCount, setTrashCount] = useState<number | undefined>();
  const [banishmentCount, setBanishmentCount] = useState<number | undefined>();
  const [baseUnitCount, setBaseUnitCount] = useState<number | undefined>();
  const [nonEquipmentGearCount, setNonEquipmentGearCount] = useState<number | undefined>();
  const [unattachedEquipmentCount, setUnattachedEquipmentCount] = useState<number | undefined>();
  const [attachedEquipmentCount, setAttachedEquipmentCount] = useState<number | undefined>();
  const [unitReadiness, setUnitReadiness] = useState<GameBoardFixtureOptions["unitReadiness"]>("mixed");
  const [equipmentReadiness, setEquipmentReadiness] = useState<GameBoardFixtureOptions["equipmentReadiness"]>("mixed");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedScenario = params.get("scenario");
    if (SCENARIOS.includes(requestedScenario as GameBoardFixtureScenario)) {
      setScenario(requestedScenario as GameBoardFixtureScenario);
    }
    const requestedRuneCount = Number(params.get("runes"));
    if (params.has("runes") && Number.isInteger(requestedRuneCount) && requestedRuneCount >= 0 && requestedRuneCount <= 12) {
      setRuneCount(requestedRuneCount);
    }
    const requestedRuneMode = params.get("runeMode");
    if (requestedRuneMode === "ready" || requestedRuneMode === "exhausted" || requestedRuneMode === "mixed") {
      setRuneMode(requestedRuneMode);
    }
    const requestedBattlefieldUnits = Number(params.get("battlefieldUnits"));
    if (params.has("battlefieldUnits") && Number.isInteger(requestedBattlefieldUnits) && requestedBattlefieldUnits >= 0 && requestedBattlefieldUnits <= 12) {
      setBattlefieldUnitCount(requestedBattlefieldUnits);
    }
    const requestedTrashCount = Number(params.get("trash"));
    if (params.has("trash") && Number.isInteger(requestedTrashCount) && requestedTrashCount >= 0 && requestedTrashCount <= 40) {
      setTrashCount(requestedTrashCount);
    }
    const requestedBanishmentCount = Number(params.get("banishment"));
    if (params.has("banishment") && Number.isInteger(requestedBanishmentCount) && requestedBanishmentCount >= 0 && requestedBanishmentCount <= 40) {
      setBanishmentCount(requestedBanishmentCount);
    }
    const boardCountParams = [
      ["baseUnits", setBaseUnitCount],
      ["baseGear", setNonEquipmentGearCount],
      ["looseEquipment", setUnattachedEquipmentCount],
      ["attachedEquipment", setAttachedEquipmentCount],
    ] as const;
    for (const [name, setCount] of boardCountParams) {
      const count = Number(params.get(name));
      if (params.has(name) && Number.isInteger(count) && count >= 0 && count <= 12) {
        setCount(count);
      }
    }
    const requestedHidden = params.get("hidden");
    if (requestedHidden === "none" || requestedHidden === "owner" || requestedHidden === "opponent" || requestedHidden === "both") {
      setHidden(requestedHidden);
    }
    const requestedUnitReadiness = params.get("unitReadiness");
    if (requestedUnitReadiness === "ready" || requestedUnitReadiness === "exhausted" || requestedUnitReadiness === "mixed") {
      setUnitReadiness(requestedUnitReadiness);
    }
    const requestedEquipmentReadiness = params.get("equipmentReadiness");
    if (requestedEquipmentReadiness === "ready" || requestedEquipmentReadiness === "exhausted" || requestedEquipmentReadiness === "mixed") {
      setEquipmentReadiness(requestedEquipmentReadiness);
    }
  }, []);
  const projection = useMemo(() => createGameBoardFixture(scenario, {
    runeCount,
    runeMode,
    battlefieldUnitCount,
    trashCount,
    banishmentCount,
    baseUnitCount,
    nonEquipmentGearCount,
    unattachedEquipmentCount,
    attachedEquipmentCount,
    unitReadiness,
    equipmentReadiness,
    hidden,
  }), [attachedEquipmentCount, banishmentCount, baseUnitCount, battlefieldUnitCount, equipmentReadiness, hidden, nonEquipmentGearCount, runeCount, runeMode, scenario, trashCount, unitReadiness, unattachedEquipmentCount]);
  return (
    <GameBoard
      matchContext={{ gameNumber: 1, scoreByPlayerId: { p1: 1, p2: 0 } }}
      onPerformAction={async () => true}
      playerNames={{ p1: "Player", p2: "Opponent" }}
      projection={projection}
      scores={{ p1: 1, p2: 0 }}
    />
  );
}
