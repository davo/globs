import state, { useSelector } from "lib/state"
import NodeListItem from "./node-list-item"
import { Draggable, PositionIndicator } from "./shared"
import { useEffect, useRef } from "react"
import { useStateDesigner } from "@state-designer/react"
import { clamp } from "lib/utils"

const HEADER_HEIGHT = 40
const ITEM_HEIGHT = 28

export default function NodeList() {
  const nodeIds = useSelector((s) => s.data.nodeIds)
  const selectedNodeIds = useSelector((s) => s.data.selectedNodes)
  const rContainer = useRef<HTMLDivElement>(null)
  const rList = useRef<HTMLOListElement>(null)

  const local = useStateDesigner({
    data: {
      draggingId: null as string | null,
      draggingIndex: -1,
      draggingDirection: "up" as "up" | "down",
      nextIndex: -1,
    },
    on: {},
    initial: "idle",
    states: {
      idle: {
        on: {
          STARTED_DRAGGING: {
            do: "setDraggingIndex",
            to: "dragging",
          },
        },
      },
      dragging: {
        onEnter: "addCancelEvent",
        onExit: ["removeCancelEvent", "cleanup"],
        on: {
          CHANGED_POSITION: [
            {
              get: "scrollDirection",
              if: "isScrolling",
              do: "scrollInDirection",
            },
            {
              get: "nextIndex",
              if: "indexChanged",
              do: "setNextIndex",
            },
          ],
          CANCELLED: { to: "idle" },
          STOPPED_DRAGGING: { do: "moveDraggingToNextPosition", to: "idle" },
        },
      },
    },
    results: {
      scrollDirection(data, payload: { point: number[] }) {
        const { point } = payload
        const { offsetTop } = rList.current!
        const { offsetHeight } = rContainer.current!

        const y = point[1] - HEADER_HEIGHT - offsetTop + ITEM_HEIGHT

        const direction =
          y < 24 ? "up" : y > offsetHeight - 24 ? "down" : "none"

        return {
          direction,
          strength:
            direction === "up"
              ? clamp(1 - y / 24, 0, 1)
              : clamp((y - offsetHeight + 24) / 24, 0, 1),
        }
      },
      nextIndex(data, payload: { point: number[] }) {
        const { draggingIndex } = data
        const { point } = payload
        const { offsetTop } = rList.current!
        const { scrollTop } = rContainer.current!

        const y =
          (point[1] - offsetTop + scrollTop - HEADER_HEIGHT) / ITEM_HEIGHT

        const nextIndex = clamp(Math.floor(y), 0, nodeIds.length - 1)

        const direction = nextIndex < draggingIndex ? "up" : "down"

        return {
          direction,
          nextIndex,
        }
      },
    },
    conditions: {
      indexChanged(data, payload, result: { nextIndex: number }) {
        return result.nextIndex !== data.nextIndex
      },
      isScrolling(
        data,
        payload,
        result: { direction: "up" | "down" | "none" }
      ) {
        return result.direction !== "none"
      },
    },
    actions: {
      addCancelEvent() {
        window.addEventListener("keydown", cancelDrag)
      },
      removeCancelEvent() {
        window.removeEventListener("keydown", cancelDrag)
      },
      scrollInDirection(
        data,
        payload,
        result: { direction: "up" | "down"; strength: number }
      ) {
        const { direction, strength } = result
        rContainer.current.scrollBy(
          0,
          10 * (direction === "up" ? -strength : strength)
        )
      },
      setDraggingIndex(
        data,
        payload: { id: string; point: number[]; index: number }
      ) {
        data.draggingId = payload.id
        data.draggingIndex = payload.index
        data.nextIndex = payload.index
      },
      setNextIndex(
        data,
        payload,
        result: { nextIndex: number; direction: "up" | "down" }
      ) {
        if (result.direction === "up") {
          data.nextIndex = clamp(result.nextIndex, 0, nodeIds.length)
        } else {
          data.nextIndex = clamp(result.nextIndex, 0, nodeIds.length)
        }

        data.draggingDirection = result.direction
      },
      moveDraggingToNextPosition(data) {
        const { draggingId, draggingIndex, nextIndex } = data

        state.send("MOVED_NODE_ORDER", {
          id: draggingId,
          from: draggingIndex,
          to: nextIndex,
          reason: "DROP",
        })
      },
      cleanup(data) {
        data.draggingIndex = -1
        data.nextIndex = -1
      },
    },
  })

  function cancelDrag(e: KeyboardEvent) {
    if (e.key === "Escape") {
      local.send("CANCELLED")
    }
  }

  const isDragging = local.isIn("dragging")

  const { nextIndex, draggingIndex, draggingDirection } = local.data

  // Scroll the selected items into view, starting with the top selected
  useEffect(() => {
    if (selectedNodeIds.length > 0) {
      const section = rContainer.current
      const sorted = selectedNodeIds.sort(
        (a, b) => nodeIds.indexOf(a) - nodeIds.indexOf(b)
      )
      const index = nodeIds.indexOf(sorted[0])
      const y = ITEM_HEIGHT * index
      const minY = section.scrollTop
      const height = section.offsetHeight - ITEM_HEIGHT * 2
      if (y < minY) {
        section.scrollTo(0, y)
      } else if (y > minY + height) {
        section.scrollTo(0, y - height)
      }
    }
  }, [selectedNodeIds, nodeIds])

  return (
    <section ref={rContainer}>
      <h2>Nodes</h2>
      <ol ref={rList}>
        {nodeIds.map((id, index) => {
          return (
            <Draggable
              key={id}
              isDragging={isDragging && draggingIndex === index}
              onDragStart={(point) =>
                local.send("STARTED_DRAGGING", {
                  id,
                  point,
                  index,
                })
              }
              onDragEnd={() => local.send("STOPPED_DRAGGING", { id, index })}
              onDrag={(point) =>
                local.send("CHANGED_POSITION", { id, index, point })
              }
            >
              <NodeListItem id={id} selected={selectedNodeIds.includes(id)} />
            </Draggable>
          )
        })}
      </ol>
      {isDragging && nextIndex !== draggingIndex && (
        <PositionIndicator
          depth={0}
          nextIndex={nextIndex}
          direction={draggingDirection}
        />
      )}
    </section>
  )
}
