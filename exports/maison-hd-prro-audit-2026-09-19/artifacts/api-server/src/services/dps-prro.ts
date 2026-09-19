import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

// This service is bundled into dist/index.mjs; build.mjs copies the contract
// beside that bundle so development and deployment resolve the same asset.
const moduleDir = dirname(fileURLToPath(import.meta.url));
const protoPath = [
  join(moduleDir, "proto/dps-prro.proto"),
  join(moduleDir, "../proto/dps-prro.proto"),
].find(existsSync);
if (!protoPath) throw new Error("DPS PRRO protobuf contract is missing");
const definition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: Number,
  defaults: true,
  oneofs: true,
});
const descriptor = grpc.loadPackageDefinition(definition) as any;
const Service = descriptor.com.programika.rro.ws.chk.ChkIncomeService;

export interface DpsCheckRequest {
  fiscalNumber: string;
  dateTime: Date;
  signedXml: Buffer;
  localNumber: number;
  type: 1 | 2 | 3;
  offlineId?: string;
  cancelId?: string;
}

export interface DpsCheckResponse {
  id: string;
  status: number;
  errorMessage?: string;
  signedId?: Buffer;
  signedData?: Buffer;
}

export interface DpsRegisterStatus {
  openShift: boolean;
  online: boolean;
  lastSigner: string;
  status: number;
  errorMessage?: string;
}

export class DpsPrroError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message);
  }
}

export class DpsPrroClient {
  private readonly client: any;

  constructor(
    address = process.env.PRRO_DPS_GRPC_URL ?? "cabinet.tax.gov.ua:9443",
    private readonly deadlineMs = Number(process.env.PRRO_DPS_TIMEOUT_MS ?? 20_000),
    credentials: grpc.ChannelCredentials = grpc.credentials.createSsl(),
  ) {
    this.client = new Service(address, credentials);
  }

  private unary<T>(method: "sendChkV2" | "lastChk" | "statusRro", request: object): Promise<T> {
    return new Promise((resolve, reject) => {
      this.client[method](request, { deadline: Date.now() + this.deadlineMs }, (error: grpc.ServiceError | null, response: T) => {
        if (error) {
          // Only RESOURCE_EXHAUSTED is safe to repeat automatically: transport
          // timeouts and disconnects may have happened after DPS committed.
          const retryable = error.code === grpc.status.RESOURCE_EXHAUSTED;
          reject(new DpsPrroError(error.details || error.message, error.code, retryable));
          return;
        }
        resolve(response);
      });
    });
  }

  async sendCheck(request: DpsCheckRequest): Promise<DpsCheckResponse> {
    const response = await this.unary<any>("sendChkV2", {
      rro_fn: request.fiscalNumber,
      date_time: request.dateTime.getTime(),
      check_sign: request.signedXml,
      local_number: request.localNumber,
      check_type: request.type,
      id_offline: request.offlineId ?? "",
      id_cancel: request.cancelId ?? "",
    });
    const status = Number(response.status);
    if (status !== 1) {
      throw new DpsPrroError(response.error_message || `DPS rejected document (${status})`, status, false);
    }
    return {
      id: response.id,
      status,
      errorMessage: response.error_message || undefined,
      signedId: response.id_sign,
      signedData: response.data_sign,
    };
  }

  async status(signedFiscalNumber: Buffer): Promise<DpsRegisterStatus> {
    const response = await this.unary<any>("statusRro", { rro_fn_sign: signedFiscalNumber });
    return {
      openShift: Boolean(response.open_shift),
      online: Boolean(response.online),
      lastSigner: String(response.last_signer ?? ""),
      status: Number(response.status),
      errorMessage: response.error_message || undefined,
    };
  }

  async lastCheck(signedFiscalNumber: Buffer): Promise<DpsCheckResponse> {
    const response = await this.unary<any>("lastChk", { rro_fn_sign: signedFiscalNumber });
    const status = Number(response.status);
    if (status !== 1) {
      throw new DpsPrroError(response.error_message || `DPS lastChk failed (${status})`, status, false);
    }
    return {
      id: response.id,
      status,
      errorMessage: response.error_message || undefined,
      signedId: response.id_sign,
      signedData: response.data_sign,
    };
  }

  close(): void {
    this.client.close();
  }
}

export const dpsPrroClient = new DpsPrroClient();