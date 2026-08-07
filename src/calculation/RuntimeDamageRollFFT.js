export function transform(real, imaginary, inverse = false) {
  const size = real.length

  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1
    while (reversed & bit) {
      reversed ^= bit
      bit >>= 1
    }
    reversed ^= bit

    if (index < reversed) {
      const currentReal = real[index]
      const currentImaginary = imaginary[index]
      real[index] = real[reversed]
      imaginary[index] = imaginary[reversed]
      real[reversed] = currentReal
      imaginary[reversed] = currentImaginary
    }
  }

  for (let width = 2; width <= size; width *= 2) {
    const angle = (inverse ? 2 : -2) * Math.PI / width
    const baseReal = Math.cos(angle)
    const baseImaginary = Math.sin(angle)

    for (let offset = 0; offset < size; offset += width) {
      let factorReal = 1
      let factorImaginary = 0
      const halfWidth = width / 2

      for (let index = 0; index < halfWidth; index += 1) {
        const even = offset + index
        const odd = even + halfWidth
        const oddReal =
          real[odd] * factorReal - imaginary[odd] * factorImaginary
        const oddImaginary =
          real[odd] * factorImaginary + imaginary[odd] * factorReal
        const evenReal = real[even]
        const evenImaginary = imaginary[even]

        real[even] = evenReal + oddReal
        imaginary[even] = evenImaginary + oddImaginary
        real[odd] = evenReal - oddReal
        imaginary[odd] = evenImaginary - oddImaginary

        const nextFactorReal =
          factorReal * baseReal - factorImaginary * baseImaginary
        factorImaginary =
          factorReal * baseImaginary + factorImaginary * baseReal
        factorReal = nextFactorReal
      }
    }
  }

  if (inverse) {
    for (let index = 0; index < size; index += 1) {
      real[index] /= size
      imaginary[index] /= size
    }
  }
}
