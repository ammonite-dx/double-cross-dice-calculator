function expi(theta) {
    return [Math.cos(theta), Math.sin(theta)]
}

function iadd([ax, ay], [bx, by]) {
    return [ax + bx, ay + by]
}

function isub([ax, ay], [bx, by]) {
    return [ax - bx, ay - by]
}

function imul([ax, ay], [bx, by]) {
    return [ax * bx - ay * by, ax * by + ay * bx]
}

function fftrec(c, T, N, s = 0, w = 1) {
    if (N === 1) return [c[s]];
    const Nh = N / 2;
    const Td = T * 2;
    const wd = w * 2;
    const rec = fftrec(c, Td, Nh, s, wd).concat(fftrec(c, Td, Nh, s + w, wd));
    for (let i = 0; i < Nh; i++) {
        const l = rec[i], re = imul(rec[i + Nh], expi(T * i));
        [rec[i], rec[i + Nh]] = [iadd(l, re), isub(l, re)];
    }
    return rec;
}

function fft0(f) {
    const N = f.length;
    const T = -2 * Math.PI / N;
    return fftrec(f, T, N);
}

function ifft0(F) {
    const N = F.length;
    const T = 2 * Math.PI / N;
    return fftrec(F, T, N).map(([r, i]) => [r / N, i / N]);
}

export function sumDistribution(distribution1,distribution2) {

    /*
    概要:
        二つの確率変数の和の分布を返す。
    input:
        distribution1 (number[]): i番目の要素に確率変数1がiとなる確率を持つ長さ1024の配列。
        distribution2 (number[]): i番目の要素に確率変数2がiとなる確率を持つ長さ1024の配列。
    output:
        sumDistribution (number[]): i番目の要素に確率変数1+確率変数2がiとなる確率を持つ長さ1024の配列。
    */

    // 入力分布の後ろに長さ1024のゼロ配列を付加し、複素数に変換
    const zeros = Array(1024).fill(0);
    const distribution1_complex = distribution1.concat(zeros).map(r=>[r,0]);
    const distribution2_complex = distribution2.concat(zeros).map(r=>[r,0]);
    // 入力分布をFourier変換
    const distribution1_fourier = fft0(distribution1_complex);
    const distribution2_fourier = fft0(distribution2_complex);
    // Fourier成分の積を計算
    var sumDistribution_fourier = Array(2048);
    for (let i=0; i<2048; i++) {
        sumDistribution_fourier[i] = imul(distribution1_fourier[i],distribution2_fourier[i]);
    }
    // 逆フーリエ変換
    const sumDistribution_complex = ifft0(sumDistribution_fourier);
    // 実数に変換し、和が1023になる確率に、和が1024以上になる確率を加算
    var sumDistribution = sumDistribution_complex.map(([r])=>r).slice(0,1024);
    const upperProtrusion = sumDistribution_complex.map(([r])=>r).slice(1024).reduce((sum,element)=>sum+element,0);
    sumDistribution[1023] += upperProtrusion;
    // 負の値を0に変換
    sumDistribution = sumDistribution.map(r=>Math.max(r,0));

    return sumDistribution;

}

export function subDistribution(distribution1,distribution2) {

    /*
    概要:
        二つの確率変数の差の分布を返す。
    input:
        distribution1 (number[]): i番目の要素に確率変数1がiとなる確率を持つ長さ1024の配列。
        distribution2 (number[]): i番目の要素に確率変数2がiとなる確率を持つ長さ1024の配列。
    output:
        sumDistribution (number[]): i番目の要素に確率変数1-確率変数2がiとなる確率を持つ長さ1024の配列。
    */

    // 入力分布2を逆順に並び替え
    const distribution2_reverse = distribution2.slice().reverse();
    // 入力分布1の後ろに長さ1024のゼロ配列を付加し、複素数に変換。入力分布2の前に長さ0、後ろに長さ1023のゼロ配列を付加し、複素数に変換。
    const zero1 = Array(1).fill(0);
    const zero1023 = Array(1023).fill(0);
    const zero1024 = Array(1024).fill(0);
    const distribution1_complex = distribution1.concat(zero1024).map(r=>[r,0]);
    const distribution2_complex = zero1.concat(distribution2_reverse).concat(zero1023).map(r=>[r,0]);
    // 入力分布をFourier変換
    const distribution1_fourier = fft0(distribution1_complex);
    const distribution2_fourier = fft0(distribution2_complex);
    // Fourier成分の積を計算
    var subDistribution_fourier = Array(2048);
    for (let i=0; i<2048; i++) {
        subDistribution_fourier[i] = imul(distribution1_fourier[i],distribution2_fourier[i]);
    }
    // 逆フーリエ変換
    const subDistribution_complex = ifft0(subDistribution_fourier);
    // 実数に変換し、和が0になる確率に、和が-1以下になる確率を加算
    var subDistribution = subDistribution_complex.map(([r])=>r).slice(1024);
    const lowerProtrusion = subDistribution_complex.map(([r])=>r).slice(0,1024).reduce((sum,element)=>sum+element,0);
    subDistribution[0] += lowerProtrusion;
    // 負の値を0に変換
    subDistribution = subDistribution.map(r=>Math.max(r,0));
    
    return subDistribution;

}