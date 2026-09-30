import "server-only";
import { checkPesepay } from "@/lib/pesepay";
import { workerInternal } from "@/lib/server/worker";

type Pending = { userId: string; credits: number; amount: number; pesepayRef?: string; pollUrl?: string };

export type FulfilResult =
  | { status: "paid"; credited: number; balance: number | null; already?: boolean }
  | { status: "pending" | "failed"; transactionStatus?: string };

/**
 * Check a payment with Pesepay and, if successful, credit the account on the
 * Worker. Idempotent: the Worker records each paid reference once.
 * `expectUser` (when given) must own the payment.
 */
export async function fulfilPayment(reference: string, expectUser?: string): Promise<FulfilResult> {
  const { pending, paid } = await workerInternal<{ pending: Pending; paid: boolean }>(
    "/api/internal/pending-get",
    { reference },
  );
  if (expectUser && pending.userId !== expectUser) throw new Error("This payment belongs to another account.");

  if (paid) {
    const r = await workerInternal<{ credited: number; balance: number | null; already?: boolean }>(
      "/api/internal/credit",
      { reference, userId: pending.userId },
    );
    return { status: "paid", credited: 0, balance: r.balance, already: true };
  }
  if (!pending.pollUrl && !pending.pesepayRef) return { status: "pending" };

  const check = await checkPesepay({ pollUrl: pending.pollUrl, referenceNumber: pending.pesepayRef });
  if (!check.paid) {
    const s = (check.transactionStatus ?? "").toUpperCase();
    const failed = ["FAILED", "CANCELLED", "DECLINED", "ERROR", "TIME_OUT", "TIMEOUT"].includes(s);
    return { status: failed ? "failed" : "pending", transactionStatus: check.transactionStatus };
  }

  const r = await workerInternal<{ credited: number; balance: number | null; already?: boolean }>(
    "/api/internal/credit",
    { reference, userId: pending.userId, paidAmount: check.amount },
  );
  return { status: "paid", credited: r.credited, balance: r.balance, already: r.already };
}
