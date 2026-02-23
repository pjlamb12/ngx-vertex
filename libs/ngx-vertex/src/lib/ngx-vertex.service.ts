import { Injectable } from '@angular/core';
import { NgxVertexItem } from './interfaces/ngx-vertex-item';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable()
export class NgxVertexService<T extends NgxVertexItem> {
  private dagModelBs: BehaviorSubject<T[][] | null> = new BehaviorSubject<
    T[][] | null
  >(null);
  public dagModel$: Observable<T[][]> = this.dagModelBs.asObservable();
  private nextStepNumber: number;

  setNextNumber(num: number): void {
    this.nextStepNumber = num;
  }

  setNewItemsArrayAsDagModel(arr: T[]) {
    const multi: T[][] = this.convertArrayToDagModel(arr);
    this.dagModelBs.next(multi);
  }

  getCurrentDagModel(): T[][] | null {
    return this.dagModelBs.getValue();
  }

  getSingleDimensionalArrayFromModel(): T[] {
    return this.convertDagModelToSingleArray(this.dagModelBs.getValue());
  }

  convertDagModelToSingleArray(arr: T[][]): T[] {
    return arr.flat();
  }

  convertArrayToDagModel(itemsArray: T[]): T[][] {
    const result: T[][] = [];
    const addedToResult = new Set<number>();

    // Queue for BFS traversal, starting from the virtual root '0'
    const queue = [0];

    while (queue.length > 0) {
      const parentId = queue.shift();

      // Find children of this parent, appropriately ordered by branch path
      const children = itemsArray
        .filter((item) => item.parentIds.includes(parentId))
        .sort((a, b) => a.branchPath - b.branchPath);

      for (let i = 0; i < children.length; i++) {
        const child = children[i];

        if (!addedToResult.has(child.stepId)) {
          // Use the exact depth of the node (longest path from root) to determine its row (level)
          const level = this.getNodeDepth(child.stepId, itemsArray);

          // Ensure all missing arrays up to the target level exist
          for (let j = 0; j <= level; j++) {
            if (!result[j]) result[j] = [];
          }

          result[level].push(child);
          addedToResult.add(child.stepId);
          queue.push(child.stepId);
        }
      }
    }

    return result;
  }

  findInDoubleArray(idToFind: number, doubleArr: T[][]): number {
    const flat: T[] = this.convertDagModelToSingleArray(doubleArr);
    return flat.findIndex((item) => item.stepId === idToFind);
  }

  removeItem(
    idToRemove: number,
    flatArray: T[],
    // isChildOfDeletedBranch is no longer needed in the public signature but was part of recursion.
    // We can keep the signature for compatibility or remove it if not public API (it is public in class).
    // The implementation will ignore it or use internal queue state.
    isChildOfDeletedBranch = false
  ): T[] {
    // QueueItem: { id: number, isChildOfDeletedBranch: boolean }
    const queue = [{ id: idToRemove, isChildOfDeletedBranch }];

    // We need to mutate the array as we go, but we want to return a new array at the end.
    // Since we already refactored to be immutable *per step*, doing it iteratively
    // means we can just keep updating a local 'currentFlatArray'.
    let currentFlatArray = [...flatArray];
    const idsToRemove = new Set<number>();

    while (queue.length > 0) {
      const { id, isChildOfDeletedBranch: childOfDeleted } = queue.shift();

      // If we already processed this ID, skip to avoid cycles/redundancy
      if (idsToRemove.has(id)) continue;

      const itemToRemove = currentFlatArray.find((i) => i.stepId === id);
      if (!itemToRemove) continue;

      // Identify children
      const children = currentFlatArray.filter((item) =>
        item.parentIds.includes(id)
      );

      // Logic from original recursion:

      const childBranchPath1 = children.find((i) => i.branchPath === 1);
      const childrenNotBranchPath1 = children.filter((i) => i.branchPath > 1);

      if (children.length > 1) {
        // 1. Keep descendants of childBranchPath1
        if (childBranchPath1) {
          // We need to update this child, effectively "moving it up"
          // We can update currentFlatArray immediately.
          const newChild = { ...childBranchPath1 };
          newChild.branchPath = itemToRemove.branchPath;

          if (newChild.parentIds.length === 1) {
            newChild.parentIds = [...itemToRemove.parentIds];
          } else {
            newChild.parentIds = newChild.parentIds.filter((pid) => pid !== id);
          }

          // Apply update
          currentFlatArray = currentFlatArray.map((i) =>
            i.stepId === newChild.stepId ? newChild : i
          );
        }

        // 2. Remove other children recursively -> add to queue
        for (const child of childrenNotBranchPath1) {
          queue.push({ id: child.stepId, isChildOfDeletedBranch: true });
        }

        // Mark current item for deletion
        idsToRemove.add(id);
      } else if (children.length === 1) {
        const onlyChild = children[0];

        if (onlyChild.parentIds.length === 1) {
          if (childOfDeleted) {
            // If parent is being deleted and this is the only child of a deleted branch, delete this too
            queue.push({ id: onlyChild.stepId, isChildOfDeletedBranch: true });
          } else {
            // Move up
            const newChild = { ...onlyChild };
            newChild.parentIds = [...itemToRemove.parentIds];
            newChild.branchPath = itemToRemove.branchPath;
            currentFlatArray = currentFlatArray.map((i) =>
              i.stepId === newChild.stepId ? newChild : i
            );
          }
        } else {
          // Child has other parents (merging paths), just remove the relationship to this deleted parent
          const newChild = { ...onlyChild };
          newChild.parentIds = newChild.parentIds.filter((pid) => pid !== id);
          currentFlatArray = currentFlatArray.map((i) =>
            i.stepId === newChild.stepId ? newChild : i
          );
        }

        idsToRemove.add(id);
      } else {
        // No children, just remove
        idsToRemove.add(id);
      }
    }

    // Final pass to remove all marked IDs
    return currentFlatArray.filter((i) => !idsToRemove.has(i.stepId));
  }

  createChildrenItems(
    startingBranch,
    numberOfChildren,
    parentIds,
    genericFields: Omit<T, keyof NgxVertexItem>
  ): T[] {
    const newChildren: T[] = [];
    for (let count = 1; count <= numberOfChildren; count++) {
      const newItem: T = <T>{
        ...genericFields,
        branchPath: startingBranch++,
        parentIds: [...parentIds],
        stepId: this.nextStepNumber++,
      };
      newChildren.push(newItem);
    }

    return newChildren;
  }

  addItem(
    parentIds: number[],
    flatArray: T[],
    numberOfChildren = 1,
    startingBranch = 1,
    genericFields: Omit<T, keyof NgxVertexItem>
  ): T[] {
    const potentialChildrenIds: number[] = [];
    parentIds.forEach((pid) => {
      flatArray
        .filter((f) => f.parentIds.includes(pid))
        .forEach((id) => potentialChildrenIds.push(id.stepId));
    });

    const newChildren: T[] = this.createChildrenItems(
      startingBranch,
      numberOfChildren,
      parentIds,
      genericFields
    );

    // Immutable update of children
    const updatedFlatArray = flatArray.map((item) => {
      if (potentialChildrenIds.includes(item.stepId)) {
        const newItem = { ...item };
        // Remove old parents and add the new child as parent
        newItem.parentIds = newItem.parentIds.filter(
          (pid) => !parentIds.includes(pid)
        );
        newItem.parentIds.push(newChildren[0].stepId);
        return newItem;
      }
      return item;
    });

    return [...updatedFlatArray, ...newChildren];
  }

  addItemAsNewPath(
    parentId: number,
    flatArray: T[],
    numberOfChildren: number,
    genericFields: Omit<T, keyof NgxVertexItem>
  ): T[] {
    const currentChildrenOfParent: T[] = flatArray
      .filter((item) => item.parentIds.includes(parentId))
      .sort((a, b) => (a.branchPath > b.branchPath ? 1 : -1));
    const nextBranch: number =
      currentChildrenOfParent[currentChildrenOfParent.length - 1].branchPath +
      1;
    const newChildren: T[] = this.createChildrenItems(
      nextBranch,
      numberOfChildren,
      [parentId],
      genericFields
    );

    return [...flatArray, ...newChildren];
  }

  getNodeDepth(stepId: number, items: T[]): number {
    const item = items.find((i) => i.stepId === stepId);
    if (!item) return 0;

    // Iterative Max Depth calculation
    // Queue structure: { id: number, depth: number }
    // Since we are looking for depth from root, and edges are child->parentIds,
    // we can traverse UPWARDS to roots.
    // Length of longest path to a root (0).

    const stack = [{ id: stepId, depth: 0 }];
    let maxDepth = 0;

    while (stack.length > 0) {
      const current = stack.pop();
      const currentItem = items.find((i) => i.stepId === current.id);

      if (!currentItem) continue;

      if (currentItem.parentIds.includes(0)) {
        // Reached a root
        if (current.depth > maxDepth) maxDepth = current.depth;
        continue;
      }

      if (currentItem.parentIds.length === 0) {
        // No parents, effectively a root? Treat as root.
        if (current.depth > maxDepth) maxDepth = current.depth;
        continue;
      }

      for (const pid of currentItem.parentIds) {
        stack.push({ id: pid, depth: current.depth + 1 });
      }
    }

    return maxDepth;
  }

  canAddRelation(childId: number, parentId: number, items: T[]): boolean {
    const childItem: T = items.find((item: T) => item.stepId === childId);
    const parentItem: T = items.find((item: T) => item.stepId === parentId);

    if (!childItem || !parentItem) {
      return false;
    }

    // does child already have parentId
    const isAlreadyChild: boolean = this.isNodeAChildOfParent(
      childId,
      parentId,
      items
    );

    // the parentId can not be a sibling to childId
    const nodesAreSiblings: boolean = this.areNodesSiblings(
      childId,
      parentId,
      items
    );

    // the child needs to be deeper than the parent
    const childDepth: number = this.getNodeDepth(childId, items);
    const parentDepth: number = this.getNodeDepth(parentId, items);
    const childIsDeeper: boolean = childDepth > parentDepth;

    // No circular parentIds
    const circularDependency: boolean = this.wouldCreateCircularDependency(
      childId,
      parentId,
      items
    );

    // child has no current parent IDs
    const noCurrentParentIds = childItem.parentIds.length === 0;

    return (
      !isAlreadyChild &&
      !nodesAreSiblings &&
      (childIsDeeper || noCurrentParentIds) &&
      !circularDependency
    );
  }

  wouldCreateCircularDependency(id1: number, id2: number, items: T[]): boolean {
    const item1: T = items.find((item: T) => item.stepId === id1);
    const item2: T = items.find((item: T) => item.stepId === id2);

    return item1.parentIds.includes(id2) || item2.parentIds.includes(id1);
  }

  isNodeAChildOfParent(childId: number, parentId: number, items: T[]): boolean {
    const childItem: T = items.find((item: T) => item.stepId === childId);
    const parentItem: T = items.find((item: T) => item.stepId === parentId);

    if (!childItem || !parentItem) {
      return false;
    }

    let isParent: boolean = childItem.parentIds.includes(parentId);

    if (!isParent) {
      for (const childParentId of childItem.parentIds) {
        isParent = this.isNodeAChildOfParent(childParentId, parentId, items);

        if (isParent) break;
      }
    }

    return isParent;
  }

  areNodesSiblings(node1Id: number, node2Id: number, items: T[]): boolean {
    const node1: T = items.find((item: T) => item.stepId === node1Id);
    const node2: T = items.find((item: T) => item.stepId === node2Id);

    if (!node1 || !node2) {
      return false;
    }

    let found = false;
    for (const parentId of node1.parentIds) {
      found = node2.parentIds.includes(parentId);

      if (found) break;
    }

    return found;
  }

  addNewStep(
    parentIds: number[],
    numberOfChildren: number,
    startingBranch = 1,
    genericFields: Omit<T, keyof NgxVertexItem>
  ): void {
    const updatedItems: T[] = this.addItem(
      parentIds,
      this.getSingleDimensionalArrayFromModel(),
      numberOfChildren,
      startingBranch,
      genericFields
    );
    const dagModel = this.convertArrayToDagModel(updatedItems);
    this.dagModelBs.next(dagModel);
  }

  addNewStepAsNewPath(
    parentId: number,
    numberOfChildren: number,
    genericFields: Omit<T, keyof NgxVertexItem>
  ): void {
    const updatedItems: T[] = this.addItemAsNewPath(
      parentId,
      this.getSingleDimensionalArrayFromModel(),
      numberOfChildren,
      genericFields
    );
    const dagModel = this.convertArrayToDagModel(updatedItems);
    this.dagModelBs.next(dagModel);
  }

  removeStep(idToRemove: number): void {
    const updatedItems: T[] = this.removeItem(
      idToRemove,
      this.getSingleDimensionalArrayFromModel(),
      false
    );
    const dagModel = this.convertArrayToDagModel(updatedItems);
    this.dagModelBs.next(dagModel);
  }

  nodeChildrenCount(stepId: number): number {
    const items: T[] = this.getSingleDimensionalArrayFromModel();
    const childCount = items.filter((i) => i.parentIds.includes(stepId)).length;
    return childCount;
  }

  addRelation(childId: number, parentId: number): T[] {
    const items: T[] = this.getSingleDimensionalArrayFromModel();
    const canAddRelation = this.canAddRelation(childId, parentId, items);

    if (canAddRelation) {
      const idx: number = items.findIndex((i: T) => i.stepId === childId);
      const updatedChild = { ...items[idx] };
      updatedChild.parentIds = [...updatedChild.parentIds, parentId];

      return items.map((i, index) => (index === idx ? updatedChild : i));
    } else {
      console.error(
        `NgxVertexService error: Cannot add parent ID ${parentId} to child ${childId}`
      );
      throw new Error(
        `NgxVertexService error: Cannot add parent ID ${parentId} to child ${childId}`
      );
    }
  }

  addNewRelation(childId: number, parentId: number): void {
    const items = this.addRelation(childId, parentId);
    const newDagModel = this.convertArrayToDagModel(items);
    this.dagModelBs.next(newDagModel);
  }

  insertNode(idOfNodeThatMoves: number, newNode: T): T[] {
    const items = this.getSingleDimensionalArrayFromModel();
    const nodeToAdd = { ...newNode, stepId: this.nextStepNumber++ };

    const itemToReplaceIndex = items.findIndex(
      (i: T) => i.stepId === idOfNodeThatMoves
    );
    const itemToReplace = { ...items[itemToReplaceIndex] };

    nodeToAdd.branchPath = itemToReplace.branchPath;
    nodeToAdd.parentIds = [...itemToReplace.parentIds];

    itemToReplace.parentIds = [nodeToAdd.stepId];
    itemToReplace.branchPath = 1;

    // Return new array with replacements
    const newItems = [...items];
    newItems[itemToReplaceIndex] = itemToReplace;
    newItems.push(nodeToAdd);

    return newItems;
  }

  insertNewNode(idOfNodeToReplace: number, newNode: T): void {
    const items = this.insertNode(idOfNodeToReplace, newNode);
    const newDagModel = this.convertArrayToDagModel(items);
    this.dagModelBs.next(newDagModel);
  }

  insertNodeAndRemoveOld(idOfNodeToReplace: number, newNode: T): T[] {
    const itemsWithInserted = this.insertNode(idOfNodeToReplace, newNode);
    const itemsAfterDeleted = this.removeItem(
      idOfNodeToReplace,
      itemsWithInserted
    );

    return itemsAfterDeleted;
  }

  insertNewNodeAndRemoveOld(idOfNodeToReplace: number, newNode: T): void {
    const itemsWithInserted = this.insertNode(idOfNodeToReplace, newNode);
    const itemsAfterDeleted = this.removeItem(
      idOfNodeToReplace,
      itemsWithInserted
    );

    const newDagModel = this.convertArrayToDagModel(itemsAfterDeleted);
    this.dagModelBs.next(newDagModel);
  }
}
