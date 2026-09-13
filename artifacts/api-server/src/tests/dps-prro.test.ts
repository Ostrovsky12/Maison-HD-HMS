import { afterEach, describe, expect, it } from "vitest";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";
import { DpsPrroClient, DpsPrroError } from "../services/dps-prro.js";

const proto = protoLoader.loadSync(fileURLToPath(new URL("../proto/dps-prro.proto", import.meta.url)), {
  keepCase: true, longs: String, enums: Number, defaults: true,
});
const Service = (grpc.loadPackageDefinition(proto) as any).com.programika.rro.ws.chk.ChkIncomeService;
const servers: grpc.Server[] = [];
const clients: DpsPrroClient[] = [];

afterEach(() => {
  clients.splice(0).forEach(client => client.close());
  servers.splice(0).forEach(server => server.forceShutdown());
});

async function testClient(implementation: Record<string, grpc.UntypedHandleCall>) {
  const server = new grpc.Server();
  server.addService(Service.service, implementation);
  const port = await new Promise<number>((resolve, reject) => {
    server.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
  servers.push(server);
  const client = new DpsPrroClient(`127.0.0.1:${port}`, 2_000, grpc.credentials.createInsecure());
  clients.push(client);
  return client;
}

describe("DPS FSKO gRPC adapter", () => {
  it("maps sendChkV2 request and accepted response", async () => {
    const client = await testClient({
      sendChkV2(call: any, callback: any) {
        expect(call.request.rro_fn).toBe("4000123456");
        expect(call.request.local_number).toBe(7);
        expect(call.request.check_type).toBe(1);
        expect(Buffer.from(call.request.check_sign).toString()).toBe("signed");
        callback(null, { id: "DPS-42", status: 1, id_sign: Buffer.from("id"), data_sign: Buffer.from("data") });
      },
      statusRro(_call: any, callback: any) {
        callback(null, { status: 1, open_shift: true, online: true });
      },
    });
    const response = await client.sendCheck({
      fiscalNumber: "4000123456",
      dateTime: new Date("2026-09-12T10:00:00Z"),
      signedXml: Buffer.from("signed"),
      localNumber: 7,
      type: 1,
    });
    expect(response.id).toBe("DPS-42");
    expect(response.signedData?.toString()).toBe("data");
  });

  it("does not mark ambiguous DPS failures safe for automatic retry", async () => {
    const client = await testClient({
      sendChkV2(_call: any, callback: any) {
        callback(null, { id: "", status: -3, error_message: "ERROR_SAVE" });
      },
      statusRro(_call: any, callback: any) {
        callback(null, { status: 1 });
      },
    });
    await expect(client.sendCheck({
      fiscalNumber: "4000123456", dateTime: new Date(), signedXml: Buffer.from("x"), localNumber: 2, type: 1,
    })).rejects.toMatchObject<DpsPrroError>({ status: -3, retryable: false });
  });
});