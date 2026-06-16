interface IResolve {
  (): void;
}

/** Promise 队列信号量，满时排队等待而非直接拒绝 */
export const createSemaphore = (max: number) => {
  let running = 0;
  const queue: IResolve[] = [];

  /** 获取许可，无可用槽位时等待 */
  const acquire = (): Promise<void> => {
    if (running < max) {
      running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => { queue.push(resolve); });
  };

  /** 释放许可，若有等待者则唤醒 */
  const release = () => {
    const next = queue.shift();
    if (next) {
      next();
    } else {
      running--;
    }
  };

  return { acquire, release };
};
