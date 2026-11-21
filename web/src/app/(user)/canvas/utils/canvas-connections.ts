import type { CanvasConnection } from "../types";

export type ConnectionIdFactory = () => string;

const defaultConnectionId: ConnectionIdFactory = () => `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** 复制节点时保留入边，让新节点仍然引用原来的上游节点。 */
export function connectionsForCopy(connections: CanvasConnection[], selectedIds: Set<string>) {
    return connections.filter((connection) => selectedIds.has(connection.toNodeId)).map((connection) => ({ ...connection }));
}

/** 粘贴时重映射内部连线；指向选区外的入边继续引用原节点。 */
export function remapCopiedConnections(connections: CanvasConnection[], idMap: Map<string, string>, createId: ConnectionIdFactory = defaultConnectionId) {
    return connections.flatMap((connection) => {
        const toNodeId = idMap.get(connection.toNodeId);
        if (!toNodeId) return [];
        return [
            {
                ...connection,
                id: createId(),
                fromNodeId: idMap.get(connection.fromNodeId) ?? connection.fromNodeId,
                toNodeId,
            },
        ];
    });
}

/** 复制单个节点时，把它原有的入边接到新节点上。 */
export function inboundConnectionsForDuplicate(connections: CanvasConnection[], sourceNodeId: string, targetNodeId: string, createId: ConnectionIdFactory = defaultConnectionId) {
    return connections
        .filter((connection) => connection.toNodeId === sourceNodeId)
        .map((connection) => ({ ...connection, id: createId(), toNodeId: targetNodeId }));
}
