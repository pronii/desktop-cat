function noop() {}

function createTrayMenuTemplate({ state, actions = {} }) {
  return [
    {
      label: '显示小猫',
      click: actions.showPet || noop
    },
    {
      label: '隐藏 5 分钟',
      click: actions.hideTemporarily || noop
    },
    {
      type: 'separator'
    },
    {
      label: '总是置顶',
      type: 'checkbox',
      checked: state.alwaysOnTopEnabled,
      click: actions.toggleAlwaysOnTop || noop
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      role: 'quit'
    }
  ];
}

function createTrayIconDataUrl() {
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAMcSURBVFhH7VftS1NRGPePaZVtzVW2QFfOjVjrRSM1TWthLwtLyyaXUKwW4kJKYRZDYZFz2IsQBUYvkANXtPUhCbIgIRh9KIi+RISF2YnfGed0d8+903vXh6Au/Ljbfc7z/H7nOc99zrlFRf+vv+maS3U451JSUAsTAw1R5TM1LD6uw6nkphc1piWihvcP24hnfTG9K21yfH4cIDvKLGRm3C/YOFJSUMlNr3wCxnp2EYd5GenxuwWbHMNd2+m4gXaPYOMwImC/dx0NDGjNDtlx2VbQMcgWsqEcY0gACBk5ADGZu8dIOtbM8eZOC82OfNz9wT1CLEMCkE4E7GvdTLz2VTkkcmw0m0iF1UTCAS/9f7K+XIilWwArKgT0edZyMtealaStwc1R5bBxW31lCam0Lqe/VYtWj4DJSFN2dqtN9A6iR6MSIZkRAdMT58iRmoqcrFw9U12YgNa6MuKwZMlDJ2rIl1dDArES8Qt+miH47Cw3GxeA9LGZX5R2C0T5cDtynGdhanifMQGn9m6iAepcpeT7bFQgWQyoDfjXOkuMCfCUFtMAyeudQvCl4MOzMM9CTk9YigC813DcYrcIQTNP+gUyLVuTZwONMz12UJ8AVv2dh7bxYLOJPj4jZVa0bGdbqumz8fO1+gTAAY6ofBYMgRkJikwuQMuGNwLP0MR0CUAbhSNmICe6Fw1QArWiVLMNdjXSONjMdAnAmsERa4hAP1/HyMLLmEB4JXSA3uWk8rGsMSWjPn0CAOxocP44GSFf+29Q/Hga5+Qs5QBSjecLL0b52G/JEd6QPiXa9QvAusE52ubnQecTWQHoiJg9A94APIdANjbR2039G9223+R6BKATso3oeSSUJX+bu+5qmJ+Kk3fXLhGXNTt7bNeGBACsGNEP0rdOC2RqmHnQS7sn/C5LW3PJ9QoAupudfK3zbUgoxKGgj4/FwUX1VKRXAIBtlR23APR5vGI3w0dpDeA/ssTsmLkquVEBANrz4So7J1EDakZYcyWMCmBAcYIEJ2AsD+5o3TgnKseqolABBUNbQP4voz8HjS+jf/L6BX0jA9jRfqwiAAAAAElFTkSuQmCC';

  return `data:image/png;base64,${pngBase64}`;
}

module.exports = {
  createTrayIconDataUrl,
  createTrayMenuTemplate
};
