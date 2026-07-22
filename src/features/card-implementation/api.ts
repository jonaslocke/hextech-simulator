export type CardImplementationStatusUpdateInput =
  | {
      setCode: string;
      gameplayIdentity: string;
      target: "card";
      status: string;
      note?: string | null;
    }
  | {
      setCode: string;
      gameplayIdentity: string;
      target: "family";
      familyId: string;
      status: string;
      note?: string | null;
    };

export type CardImplementationStatusUpdateResponse =
  | {
      accepted: true;
      card: {
        gameplayIdentity: string;
        status: string;
        canonicalModel: {
          cardCode: string;
          approvedAt: string;
        } | null;
        familyStatuses: Array<{
          familyId: string;
          status: string;
          updatedAt: string;
          note?: string;
        }>;
        history: Array<{
          at: string;
          event: string;
          status: string;
          familyId?: string;
          note?: string;
        }>;
        updatedAt: string;
      };
      setUpdatedAt: string;
    }
  | {
      accepted: false;
      error: {
        code: string;
        message: string;
        details?: string[];
      };
    };

export async function updateCardImplementationStatus(
  input: CardImplementationStatusUpdateInput,
): Promise<CardImplementationStatusUpdateResponse> {
  const response = await fetch("/api/admin/card-implementation/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return (await response.json()) as CardImplementationStatusUpdateResponse;
}
