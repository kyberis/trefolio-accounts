"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Business ops Telegram linking (staff / env-admins). Uses session cookie +
 * POST /api/account/ops-telegram/* (requires platform staff).
 */

function opsTelegramApiErrorMessage(data: { reason?: string; error?: string }): string {
  if (data.reason === "missing_or_invalid_session") {
    return (
      "Your browser did not send an idp_session cookie on this request. Reload the page, sign in again on " +
      "this host (e.g. Continue with Google on /agents), then retry. " +
      "In DevTools → Application → Cookies for user.trefolio.com you should see idp_session after sign-in."
    );
  }
  if (data.reason === "trefolio_link_failed" || data.reason === "trefolio_unlink_failed") {
    return "Could not reach trefolio ProdOps right now. Retry in a moment, or generate the link from trefolio.com/admin/settings.";
  }
  return data.reason || data.error || "Request failed";
}

export default function OpsTelegramConnectPanel({
  initialLinked,
}: {
  initialLinked: boolean;
}) {
  const router = useRouter();
  const [linked, setLinked] = useState(initialLinked);
  const [opsDeepLink, setOpsDeepLink] = useState("");
  const [opsMsg, setOpsMsg] = useState("");
  const [opsErr, setOpsErr] = useState("");

  useEffect(() => {
    setLinked(initialLinked);
  }, [initialLinked]);

  return (
    <>
      <p style={{ fontSize: 14, marginBottom: 8 }}>
        Status: <strong>{linked ? "Telegram linked" : "Not linked"}</strong>
      </p>
      {opsErr ? (
        <p style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }} role="alert">
          {opsErr}
        </p>
      ) : null}
      {opsMsg ? (
        <p style={{ color: "#34d399", fontSize: 13, marginBottom: 8 }} aria-live="polite">
          {opsMsg}
        </p>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          className="btn-primary"
          onClick={async () => {
            setOpsErr("");
            setOpsMsg("");
            setOpsDeepLink("");
            try {
              const res = await fetch("/api/account/ops-telegram/code", {
                method: "POST",
                credentials: "include",
              });
              const data = await res.json();
              if (!res.ok) throw new Error(opsTelegramApiErrorMessage(data));
              const link = String(data.deep_link || "");
              setOpsDeepLink(link);
              setOpsMsg("Open the link on this phone (Telegram) within 15 minutes.");
            } catch (e) {
              setOpsErr(e instanceof Error ? e.message : "Could not create link.");
            }
          }}
        >
          Generate Telegram link
        </button>
        {opsDeepLink ? (
          <a href={opsDeepLink} className="btn-mini" style={{ textDecoration: "none" }} rel="noreferrer">
            Open in Telegram →
          </a>
        ) : null}
        {linked ? (
          <button
            type="button"
            className="btn-mini"
            onClick={async () => {
              setOpsErr("");
              setOpsMsg("");
              try {
                const res = await fetch("/api/account/ops-telegram/disconnect", {
                  method: "POST",
                  credentials: "include",
                });
                const data = await res.json();
                if (!res.ok) throw new Error(opsTelegramApiErrorMessage(data));
                setOpsMsg("Telegram disconnected.");
                setLinked(false);
                router.refresh();
              } catch (e) {
                setOpsErr(e instanceof Error ? e.message : "Disconnect failed.");
              }
            }}
          >
            Disconnect Telegram
          </button>
        ) : null}
      </div>
    </>
  );
}
