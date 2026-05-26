package app.vittoria.home

import org.junit.Assert.assertEquals
import org.junit.Test

class AppSmokeTest {
    @Test
    fun packageName_isCorrect() {
        assertEquals("app.vittoria.home", AppSmokeTest::class.java.`package`?.name)
    }
}
