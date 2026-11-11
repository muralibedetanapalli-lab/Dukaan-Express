import { db } from "@/server/db";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/misc";
import { Pill } from "@/components/shared/status-badge";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Audit & webhooks" };

export default async function AuditPage() {
  const [logs, hooks] = await Promise.all([
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { actor: { select: { name: true, email: true } } } }),
    db.webhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return (
    <div>
      <PageHeader title="Audit log & webhooks" description="Who changed what, and every inbound Cashfree / Shiprocket event" />
      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="webhooks">Webhook events</TabsTrigger>
        </TabsList>
        <TabsContent value="audit" className="mt-4">
          <Card className="gap-0 overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id} className="align-top">
                    <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(l.createdAt)}</TableCell>
                    <TableCell className="text-xs">
                      {l.actor?.name ?? l.actorRole.toLowerCase()}
                      <span className="block text-muted-foreground">{l.actorRole.replace("_", " ").toLowerCase()}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.action}</TableCell>
                    <TableCell className="text-xs">
                      {l.entityType}
                      <span className="block font-mono text-muted-foreground">{l.entityId?.slice(0, 14)}</span>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <pre className="max-h-24 overflow-auto text-[11px] whitespace-pre-wrap text-muted-foreground">
                        {l.before ? `before: ${JSON.stringify(l.before)}\n` : ""}
                        {l.after ? `after: ${JSON.stringify(l.after)}` : ""}
                      </pre>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="webhooks" className="mt-4">
          <Card className="gap-0 overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Signature</TableHead>
                  <TableHead>Processing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hooks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No webhook events received yet
                    </TableCell>
                  </TableRow>
                )}
                {hooks.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(h.createdAt)}</TableCell>
                    <TableCell>{h.provider}</TableCell>
                    <TableCell className="font-mono text-xs">{h.eventType}</TableCell>
                    <TableCell>
                      <Pill tone={h.signatureValid ? "success" : "danger"}>{h.signatureValid ? "valid" : "invalid"}</Pill>
                    </TableCell>
                    <TableCell className="text-xs">
                      {h.processedAt ? <Pill tone="success">processed</Pill> : <Pill tone="warning">pending</Pill>} {h.attempts} attempt(s)
                      {h.error && <span className="block text-destructive">{h.error}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
