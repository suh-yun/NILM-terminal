#include <string.h>
void score(double * input, double * output) {
    double var0[3];
    if (input[8] <= -0.663381889462471) {
        memcpy(var0, (double[]){0.0, 0.0, 1.0}, 3 * sizeof(double));
    } else {
        if (input[7] <= 0.5183655917644501) {
            memcpy(var0, (double[]){1.0, 0.0, 0.0}, 3 * sizeof(double));
        } else {
            memcpy(var0, (double[]){0.0, 1.0, 0.0}, 3 * sizeof(double));
        }
    }
    memcpy(output, var0, 3 * sizeof(double));
}
