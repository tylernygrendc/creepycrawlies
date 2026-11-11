export function capitalize(str) {
    if (!str) return "";
    else return str.charAt(0).toUpperCase() + str.slice(1);
}

export function numberToWords(num) {
    if (num === 0) return "zero";

    const ones = [
        "",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
        "eleven",
        "twelve",
        "thirteen",
        "fourteen",
        "fifteen",
        "sixteen",
        "seventeen",
        "eighteen",
        "nineteen",
    ];
    const tens = [
        "",
        "",
        "twenty",
        "thirty",
        "forty",
        "fifty",
        "sixty",
        "seventy",
        "eighty",
        "ninety",
    ];
    const scales = ["", "thousand", "million", "billion"];

    function convertLessThanThousand(n) {
        let str = "";

        if (n >= 100) {
            str += ones[Math.floor(n / 100)] + " hundred ";
            n %= 100;
        }

        if (n >= 200 || n >= 20) {
            str += tens[Math.floor(n / 10)] + " ";
            n %= 10;
        }

        if (n > 0) {
            str += ones[n] + " ";
        }

        return str.trim();
    }

    let wordResult = "";
    let scaleIndex = 0;

    // handle negative numbers
    if (num < 0) {
        return "minus " + numberToWords(Math.abs(num));
    }

    while (num > 0) {
        let chunk = num % 1000;
        if (chunk !== 0) {
            let chunkStr = convertLessThanThousand(chunk);
            wordResult =
                chunkStr +
                (scales[scaleIndex] ? " " + scales[scaleIndex] : "") +
                " " +
                wordResult;
        }
        num = Math.floor(num / 1000);
        scaleIndex++;
    }

    return wordResult.trim();
}
