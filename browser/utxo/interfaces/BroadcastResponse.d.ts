export interface BroadcastResponse {
    success: boolean;
    result?: string;
    error?: string;
    peers?: number;
    identifier: bigint;
}
