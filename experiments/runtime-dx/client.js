function createWorkerError(event) {
  return new Error(event?.message || 'Runtime DX Worker failed')
}

export function createDxWorkerClient() {
  const workerUrl = new URL('./worker.js', import.meta.url)
  const worker = new Worker(workerUrl, { type: 'module' })
  const pendingById = new Map()
  let nextRequestId = 0
  let disposed = false
  let readyReceived = false

  function rejectPending(error) {
    for (const entry of pendingById.values()) {
      entry.reject(error)
    }
    pendingById.clear()
  }

  function handleMessage(event) {
    if (event.data?.type === 'ready') {
      readyReceived = true
      return
    }

    const entry = pendingById.get(event.data?.id)
    if (!entry) {
      return
    }
    pendingById.delete(entry.id)

    if (event.data.error) {
      const error = new Error(event.data.error.message)
      error.name = event.data.error.name || 'Error'
      entry.reject(error)
      return
    }

    if (!(event.data.distribution instanceof Float64Array)) {
      entry.reject(new Error('Worker returned a non-Float64Array distribution'))
      return
    }

    entry.resolve(event.data.distribution)
  }

  function handleWorkerFailure(event) {
    rejectPending(createWorkerError(event))
  }

  worker.addEventListener('message', handleMessage)
  worker.addEventListener('error', handleWorkerFailure)
  worker.addEventListener('messageerror', handleWorkerFailure)

  function calculate(params) {
    if (disposed) {
      return Promise.reject(new Error('Runtime DX client is disposed'))
    }

    const id = nextRequestId
    nextRequestId += 1

    return new Promise((resolve, reject) => {
      pendingById.set(id, { id, resolve, reject })
      try {
        worker.postMessage({ id, params })
      } catch (error) {
        pendingById.delete(id)
        reject(error)
      }
    })
  }

  function dispose() {
    if (disposed) {
      return
    }
    disposed = true
    rejectPending(new Error('Runtime DX client was disposed'))
    worker.terminate()
  }

  return {
    calculate,
    dispose,
    get readyReceived() {
      return readyReceived
    },
    workerUrl: workerUrl.href,
  }
}
