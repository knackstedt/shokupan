import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";
import type { ElkEdgeSection } from "elkjs/lib/elk-api";
import React from 'react';

export type ElkEdgeData = Edge<
    {
        path?: ElkEdgeSection;
    },
    "elk"
>;

const getRoundedPath = (points: any[], radius = 10) => {
    if (points.length < 2) return "";
    if (points.length === 2) {
        return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
    }

    let path = `M${points[0].x},${points[0].y}`;

    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];

        const lenPrev = Math.hypot(curr.x - prev.x, curr.y - prev.y);
        const lenNext = Math.hypot(next.x - curr.x, next.y - curr.y);

        const r = Math.min(radius, lenPrev / 2, lenNext / 2);

        const before = {
            x: curr.x - (r * (curr.x - prev.x)) / lenPrev,
            y: curr.y - (r * (curr.y - prev.y)) / lenPrev,
        };
        const after = {
            x: curr.x + (r * (next.x - curr.x)) / lenNext,
            y: curr.y + (r * (next.y - curr.y)) / lenNext,
        };

        path += ` L${before.x},${before.y} Q${curr.x},${curr.y} ${after.x},${after.y}`;
    }

    const last = points[points.length - 1];
    path += ` L${last.x},${last.y}`;
    return path;
};

export function ElkEdge(props: EdgeProps<ElkEdgeData>) {
    const { data, id, markerEnd, style } = props;
    const { startPoint, endPoint, bendPoints = [] } = data?.path || {};

    if (!startPoint || !endPoint) return null;

    const allPoints = [startPoint, ...bendPoints, endPoint];
    const smoothedPath = getRoundedPath(allPoints, 12);

    const isDev = (data as any)?.type === 'dev';

    return React.createElement(BaseEdge, {
            path: smoothedPath,
            markerEnd: markerEnd,
            style: {
                strokeWidth: isDev ? 1.5 : 1,
                stroke: isDev ? '#60a5fa' : '#b1b1b7',
                strokeDasharray: isDev ? '6 4' : undefined,
                ...style,
            }
        }
    );
}
