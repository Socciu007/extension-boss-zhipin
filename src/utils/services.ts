import axios from 'axios'

// Fetch truck data
const fetchTruckData = async () => {
  // const url = 'http://localhost:3001/vn/yitong/truckCompany'
  const url = 'https://www.dadaex.cn/api/vn/yitong/truckCompany'
  try {
    const res = await axios.get(url)
    return res.data
  } catch (error) {
    return error
  }
}

// Fetch order data for ONE company
const fetchOrderData = async ({ page, pageSize, blNo }: { page: number, pageSize: number, blNo: string }) => {
  const url = `https://www.dadaex.cn/api/vn/eir/order?page=${page}&pageSize=${pageSize}&shipCompany=30&blNo=${blNo}`
  // const url2 = 'https://www.dadaex.cn/api/vn/eir/order'
  try {
    const res = await axios.get(url)
    return res.data
  } catch (error) {
    return error
  }
}

// Update order data
const updateOrderData = async ({ blNo, trailerCompany }: { blNo: string, trailerCompany: number }) => {
  const url = 'https://www.dadaex.cn/api/vn/yitong/truckCompany'
  try {
    const data = {
      blNo,
      trailerCompany,
    }
    const res = await axios.patch(url, data)
    return res.data
  } catch (error) {
    return error
  }
}

// Yitong WEP API
// Get yitong order data from eptrade
const getYitongOrderData = async (cookie: string, params: any) => {
  const url = 'https://www.eptrade.cn/epb/cdus.html?method=search1'
  try {
    // Add params to form data
    const { page, rows } = params

    // Add header cookie
    const headers = {
      Cookie: cookie,
    }
    // Add body data by form data
    const formData = new FormData()
    formData.append('param.ebw2Booking.recvCode', 'ONEY')
    formData.append('className', 'com.easipass.ebw2.dao.model.Ebw2Booking ebw2Booking')
    formData.append('forward', 'booking/common/cd_book_list')
    formData.append('param.ebw2Booking.sendCode', '743280357')
    formData.append('param.ebw2Booking.cdbookStatus', 'Y')
    formData.append('page', page.toString() || '1')
    formData.append('rows', rows.toString() || '100')
    formData.append('sort', 'updateTime')
    formData.append('order', 'desc')

    // Call api get data
    const res = await axios.post(url, formData, { headers })
    return res.data
  } catch (error) {
    return error
  }
}

// Fill truck for yitong order on website
const fillTruckForYitongOrder = async (cookie: string, params: any) => {
  const url = 'https://www.eptrade.cn/epb/batchChangeCarrier.html'
  try {
    const formData = new FormData()
    formData.append('param.appointCarrierCode', params.truckCode)
    formData.append('param.bookingNos', `["${params.bookingNo}"]`)
    const headers = {
      Cookie: cookie,
    }
    const res = await axios.post(url, formData, { headers })
    return res.data
  } catch (error) {
    return error
  }
}

// https://vn2.dadaex.cn/api/moneyapi
// http://localhost:3000/moneyapi
// Save yitong order data to database
const saveYitongOrderData = async (data: any) => {
  const url = 'https://vn2.dadaex.cn/api/moneyapi/yitong'
  try {
    const res = await axios.post(url, data)
    return res.data
  } catch (error) {
    return error
  }
}

// Get data yitong order from database
const getYitongOrderDataDb = async (status: string | undefined) => {
  const url = status === '2' ? `https://vn2.dadaex.cn/api/moneyapi/yitong?status=${status}` : `https://vn2.dadaex.cn/api/moneyapi/yitong`
  try {
    const res = await axios.get(url)
    return res.data
  } catch (error) {
    return error
  }
}

// Update yitong order data to database
const updateYitongOrderDataDb = async ({ bookingNo, statusTruck, statusTruckEb }: { bookingNo: string, statusTruck: number, statusTruckEb: number }) => {
  const url = 'https://vn2.dadaex.cn/api/moneyapi/yitong'
  try {
    const res = await axios.patch(url, {
      bookingNo,
      statusTruck,
      statusTruckEb,
    })
    return res.data
  } catch (error) {
    return error
  }
}

export {
  fetchTruckData,
  fetchOrderData,
  updateOrderData,
  getYitongOrderData,
  saveYitongOrderData,
  getYitongOrderDataDb,
  updateYitongOrderDataDb,
  fillTruckForYitongOrder
}